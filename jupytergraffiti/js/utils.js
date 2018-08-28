define([
  'components/marked/lib/marked'
], function (marked) {

  const utils = {
    cellMaps: {},

    generateUniqueId: () => {
      return 'id_' + Math.random().toString(36).substr(2, 6);
    },

    getNow: () => {
      return new Date().getTime();
    },

    // Assign cellIds to any cells that don't have them yet.
    assignCellIds: () => {
      const cells = Jupyter.notebook.get_cells();
      let cell, cellId, iStr, i, innerCell;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        cellId = utils.generateUniqueId();
        if (!cell.metadata.hasOwnProperty('cellId')) {
          cell.metadata.cellId = cellId;
        }
      }
    },

    refreshCellMaps: () => {
      utils.cellMaps = {
        cells: Jupyter.notebook.get_cells(),
        maps: {}
      }
      let cell, cellDOM, cellKeys = Object.keys(utils.cellMaps.cells);
      for (let cellIndex = 0; cellIndex < cellKeys.length; ++cellIndex) {
        cell = utils.cellMaps.cells[cellIndex];
        // supports lookups by cellId
        utils.cellMaps.maps[cell.metadata.cellId] = cellIndex;
        // Dress up the DOM  cellId so we can track selections in them (pretty much only markdown, selections in code_mirror are done through its API
        if (cell.hasOwnProperty('inner_cell')) {
          cellDOM = $(cell.inner_cell).parents('.cell');
        } else if (cell.hasOwnProperty('element')) {
          cellDOM = $(cell.element);
        }
        if (cellDOM !== undefined) {
          if (cellDOM.attr('graffiti-cell-id') === undefined) {
            cellDOM.attr({ 'graffiti-cell-id' : cell.metadata.cellId});
          }
        }
      }
    },

    findCellByCellId: (cellId) => {
      return utils.cellMaps.cells[utils.cellMaps.maps[cellId]];
    },

    findCellIndexByCellId: (cellId) => {
      return utils.cellMaps.maps[cellId];
    },

    findCellByCodeMirror: (cm) => {
      for (let cell of utils.cellMaps.cells) {
        if (cell.code_mirror === cm) {
          return cell;
        }
      }
      return undefined;
    },
    
    renderMarkdown: (contents) => {
      // Strip out special commands eg. headline commands and make all hrefs pop new tabs
      const cleanedContents = contents.replace(/^%%(.*)$/mg, '');
      return marked(cleanedContents).replace(/(href=".*")>/g, "$1 target=\"_blank\">");
    },

    collectViewInfo: (clientY, notebookPanelHeight, scrollTop, garnishing, garnishStyle) => {
      let cellElement, cellRect;
      const inputCells = Jupyter.notebook.get_cells();
      const selectedCell = Jupyter.notebook.get_selected_cell();
      const selectedCellId = selectedCell.metadata.cellId;
      // handle case where pointer is above all cells or below all cells
      let cellIndex, cellIndexStr, cell, innerCell, innerCellRect, innerCellRectRaw, cellPosition, cm;
      for (cellIndexStr in inputCells) {
        cellIndex = parseInt(cellIndexStr);
        cell = inputCells[cellIndex];
        cellElement = cell.element[0];
        cellRect = cellElement.getBoundingClientRect();
        if ( ((cellRect.top <= clientY) && (clientY <= cellRect.bottom)) ||
             // These are the cases where the pointer is above the first cell or below the last cell
             (((cellIndex === 0) && (clientY < cellRect.top)) ||
              ((cellIndex === inputCells.length - 1) && (cellRect.bottom < clientY))) ) {
          innerCell = $(cellElement).find('.inner_cell')[0];
          innerCellRectRaw = innerCell.getBoundingClientRect();
          innerCellRect = { 
            top: innerCellRectRaw.top, 
            left: innerCellRectRaw.left, 
            width: innerCellRectRaw.width, 
            height: innerCellRectRaw.height 
          };
          cellPosition = $(cellElement).position();
          cm = cell.code_mirror;
          return {
            cellId: cell.metadata.cellId, // The id of cell that the pointer is hovering over right now
            cellRect: cellRect,           // The bounding rect for that cell.
            innerCellRect: innerCellRect,
            innerScroll: cm.getScrollInfo(),
            cellPositionTop: cellPosition.top,
            selectedCellId: selectedCellId,
            notebookPanelHeight: notebookPanelHeight,
            garnishing: garnishing,
            garnishStyle: garnishStyle,
            scrollTop: scrollTop
          };
        }
      }
      return { cellId: undefined, cellRectTop: undefined, cellRectBottom: undefined };

    },

    getCellDimensions: () => {
      const inputCells = Jupyter.notebook.get_cells();
      let cell, cellDimensions = {}, elem;
      for (cell of inputCells) {
        elem = $(cell.element[0]);
        cellDimensions[cell.metadata.cellId] = { 
          position: elem.position(),
          width:  elem.width(),
          height: elem.height()
        }
      }
      return cellDimensions;
    },

    getActiveCellId: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      return activeCell.metadata.cellId;
    },

    getActiveCellLineNumber: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      const cm = activeCell.code_mirror;
      const selections = cm.listSelections();
      const activeLine = selections[0].anchor.line;
      return activeLine;
    },

    saveNotebook: () => {
      Jupyter.notebook.save_notebook().then( () => { console.log('Graffiti: Notebook saved.') });
    },

    collectTokenStrings: (allTokens, tokens) => {
      const subTokens = allTokens.slice(tokens.firstTokenOffset, tokens.firstTokenOffset + tokens.extraTokens + 1);
      return subTokens.reduce( (tokensString, token) => { tokensString + token.string } )
    },

    // Find out whether the current selection intersections with any graffiti token ranges, or which tokens are in the selection if not.
    findSelectionTokens: (recordingCell,  tokenRanges, state) => {
      //console.log('findSelectionTokens, tokenRanges:', tokenRanges);
      let range, startRange, endRange, recording, hasMovie, recordingKey, markdown, isIntersecting = false;
      const recordingCellId = recordingCell.metadata.cellId;
      const recordingCellType = recordingCell.cell_type;
      const cm = recordingCell.code_mirror;
      const selections = cm.listSelections();
      const firstSelection = selections[0];
      const anchorPos = cm.indexFromPos(firstSelection.anchor);
      const headPos = cm.indexFromPos(firstSelection.head);
      const startPos = Math.min(anchorPos, headPos);
      const endPos = Math.max(anchorPos, headPos);
      let minStartRange = 1000000000;
      const noResults = { isIntersecting: false, noTokensPresent: true };
      let results = noResults;

      if (recordingCellType === 'markdown') {
        // If in a markdown cell, the selection "tokens" are simply the selection, but only if the selection is 2 characters or more. We do not try to use
        // code mirror's tokenizer tools within markdown cells as there's other stuff like html in a markdown cell that could be confusing to it.
        const contents = recordingCell.get_text();
        let tagsRe = RegExp('<span class="graffiti-highlight (graffiti-[^"]+)">(.*?)</span>','g')
        let tags = [], match, tag;
        let idMatch;
        while ((match = tagsRe.exec(contents)) !== null) { 
          idMatch = match[1].match(/graffiti-(id_.[^\-]+)-(id_[^\s]+)/);
          tags.push({
            fullMatch: match[0],
            recordingCellId: idMatch[1],
            recordingKey: idMatch[2],
            innerText: match[2],
            startRange: match.index,
            endRange: match.index + match[0].length
          }); 
        }
        console.log("tags:", tags);

        // Figure out if the startPs or endPos is inside an existing Graffiti in this markdown cell (intersecting).
        if (tags.length > 0) {
          for (tag of tags) {
            if ( ((startPos >= tag.startRange) && (startPos <= tag.endRange)) ||
                 ((endPos >= tag.startRange) && (endPos <= tag.endRange)) ) {
              isIntersecting = true;
              break;
            }
          }
        }
        if (isIntersecting) {
          recording = state.getManifestSingleRecording(tag.recordingCellId, tag.recordingKey);
          if (recording !== undefined) {
            markdown = recording.markdown;
            hasMovie = recording.hasMovie;
            results = {
              isIntersecting: true,
              noTokensPresent: false,
              recordingCell: recordingCell,
              recordingCellId: recordingCellId,
              recordingKey: tag.recordingKey, 
              hasMovie: hasMovie,
              allTokensString: tag.innerText,
              markdown: tag.innerText,
              range: {
                start: tag.startRange,
                end:   tag.endRange,
              }
            }
          }
        } else {
          // now check for a selection in the markdown cm cell
          if (endPos - startPos > 0) { // 2 or more chars is in the selection; this way we disallow Graffitis applied to just CR's
            results = {
              isIntersecting: false,
              noTokensPresent: false,
              range: {
                start: startPos,
                end: endPos
              },
              allTokensString: cm.getSelection()
            }
          }
        }
        console.log('final results:',results);
      } else if (recordingCellType === 'code') {
        // If in a code cell, try to find tokens in and around the selection.
        if (tokenRanges[recordingCellId] !== undefined) {
          const tokenRangesThisCell = tokenRanges[recordingCellId];
          for (recordingKey of Object.keys(tokenRangesThisCell)) {
            range = tokenRangesThisCell[recordingKey];
            startRange = cm.indexFromPos(range.start);
            endRange = cm.indexFromPos(range.end);
            console.log('startPos:', startPos, 'endPos:', endPos, '| startRange:', startRange, 'endRange:', endRange, 'range:', range);
            if ((startPos <= startRange && endPos >= endRange) || // selection surrounds or equals the range
                ((startPos >= startRange && startPos <= endRange) || (endPos >= startRange && endPos <= endRange))) { // selection is inside the range
              if (startRange < minStartRange) {
                minStartRange = startRange;
                recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
                markdown = recording.markdown;
                hasMovie = recording.hasMovie;
                //console.log('found range:', range);
                isIntersecting = true;
                results = {
                  isIntersecting: true,
                  noTokensPresent: false,
                  range: range,
                  recordingCell: recordingCell,
                  recordingCellId: recordingCellId,
                  recordingKey: recordingKey, 
                  markdown: markdown,
                  hasMovie: hasMovie,
                  range: {
                    start: startRange,
                    end:   endRange
                  }
                };
              }
            }
          }
        }
        if (!isIntersecting) {
          // we didn't find a match within existing recordings. See what tokens are selected overall in that case.
          // console.log('not intersecting, now checking for new graffiti creation');
          const allTokens = utils.collectCMTokens(cm);
          let startCheck, endCheck, token, startToken, endToken, lastToken, startTokenIndex, tokenCount = 0, tokensString = '';
          if (allTokens.length === 0) {
            // degnerate case 1: no tokens present at all in the cell
            results = noResults;
          } else {
            token = allTokens[allTokens.length - 1];
            endCheck = cm.indexFromPos({line: token.line, ch: token.end});
            if (startPos > endCheck) {
              // degenerate case 2: selection caret is past the last token present
              results = noResults;
            } else {
              for (let i = 0; i < allTokens.length; ++i) {
                lastToken = token;
                token = allTokens[i];
                startCheck = cm.indexFromPos({line: token.line, ch: token.start});
                endCheck = cm.indexFromPos({line: token.line, ch: token.end});
                //console.log('startPos, endPos:', startPos, endPos, 'checking token:', token.string, startCheck, endCheck);
                if (startToken === undefined) {
                  if ((startPos >= startCheck && startPos <= endCheck) ||
                      (endPos >= startCheck && endPos <= endCheck)) {
                    startToken = token;
                    startTokenIndex = i;
                    tokenCount = 1;
                    tokensString = startToken.string;
                    //console.log('start token:', startToken);
                    if (startPos === endPos) {
                      endToken = token; // the selection is zero characters long so the startToken and the endToken are the same
                    }
                  }
                } else if (!(startCheck >= endPos)) { // scan forward for the ending token
                  endToken = token;
                  tokenCount++;
                  tokensString += token.string;
                  //console.log('end token:', endToken);
                }
                if (startCheck > endPos) {
                  if (startToken === undefined && lastToken !== undefined) {
                    console.log('Graffiti: between tokens, so cannot create a Graffiti.');
                    results = noResults;
                  }
                  break;
                }
              }
              
              // Find the occurence count of the first token in the code cell, e.g. if the token is the second "hello" in "hello there, mr. hello dude"
              if (startToken === undefined) {
                results = noResults;
                console.log('Graffiti: degenerate case 3, startToken not found despite everything. Falling to safe route.');
              } else {
                //console.log('Graffiti: startPos, endPos:', startPos, endPos, 'startToken,endToken:', startToken,endToken);
                startToken.offset = 0;
                for (let i = 0; i < allTokens.length; ++i) {
                  token = allTokens[i];
                  if (token.type === startToken.type && token.string === startToken.string) {
                    if (i < startTokenIndex) {
                     ++startToken.offset;
                    } else {
                      break;
                    }
                  }
                }

                if (endToken === undefined) {
                  console.log('Graffiti: degenerate case 4, endToken not found. Falling to safe route.');
                  endToken = startToken; // degenerate case 4: never found an end token, assume just one token. not sure why this happens yet 8/20/18
                }

                results = {
                  isIntersecting: false,
                  noTokensPresent: false,
                  tokens: {
                    start: {
                      type: startToken.type,
                      string: startToken.string,
                      offset: startToken.offset
                    },
                    count: tokenCount
                  },
                  allTokensString: tokensString,
                  range: {
                    start: cm.indexFromPos({line:startToken.line, ch: startToken.ch}),
                    end:   cm.indexFromPos({line:endToken.line, ch: endToken.ch})
                  }
                }
              }
            }
          }
        }
      }

      //console.log('findIntersectingRange results:', results);
      return results;
    },

    // Collect all tokens in code-mirror into an array and tag each with which line it's found on. We use this 
    // in refreshGraffitiHighlights() as we mark up a cell with existing recorded graffitis.
    collectCMTokens: (cm) => {
      let allTokens = [];
      const lineCount = cm.lineCount();
      for (let i = 0; i < lineCount; ++i) {
        lineTokens = cm.getLineTokens(i);
        for (let j of Object.keys(lineTokens)) {
          lineTokens[j].line = i;
        }
        allTokens = allTokens.concat(lineTokens);
      }
      return allTokens;
    },

    // Given a start token string and a tokenOffset, and how many subsequent tokens are needed, pull the line and character ranges
    // out of the given code mirror instance (since those ranges might have changed since the graffiti was first created).
    getCMTokenRange: (cm, tokens, allTokens) => {
      const startToken = tokens.start;
      const allTokensLength = allTokens.length;
      let i, tokenCounter = 0, lineTokens, token, firstTokenPosition;
      for (i = 0; i < allTokensLength; ++i) {
        token = allTokens[i];
        if ((token.string === startToken.string) && (token.type === startToken.type)) {
          if (tokenCounter === startToken.offset) {
            firstTokenPosition = i;
            break;
          } else {
            ++tokenCounter;
          }
        }
      }
      if (firstTokenPosition === undefined) {
        return undefined; // couldn't find first token
      }
      const lastTokenPosition = Math.min(allTokensLength - 1, firstTokenPosition + tokens.count - 1);
      const firstToken = allTokens[firstTokenPosition];
      const lastToken = allTokens[lastTokenPosition];

      return {
        start: {
          line: firstToken.line, ch: firstToken.start
        },
        end: {
          line: lastToken.line, ch: lastToken.end
        }
      };
    },

    cleanSelectionRecord: (rec) => {
      return {
        anchor: { 
          ch: rec.anchor.ch,
          line: rec.anchor.line
        },
        head: {
          ch: rec.head.ch,
          line: rec.head.line
        }
      }
    },

    cleanSelectionRecords: (recs) => {
      let cleanedRecs = [];
      if (recs.length === 0) {
        return cleanedRecs;
      }
      for (let i = 0; i < recs.length; ++i) {
        cleanedRecs.push(utils.cleanSelectionRecord(recs[i]));
      }
      return cleanedRecs;
    },

    //
    // Time formatting functions
    //
    timeZeroPad: (num) => {
      const strNum = num.toString();
      return(strNum.length < 2 ? '0' + strNum : strNum);
    },

    formatTime: (currentTimeMilliseconds) => {
      //const currentTimeMilliseconds = duration * proportion;
      const currentTimeSeconds = currentTimeMilliseconds / 1000;
      const computedHour = Math.floor(currentTimeSeconds / 3600);
      const computedMinutes = Math.floor((currentTimeSeconds - (computedHour * 3600)) / 60);
      const computedSeconds = Math.floor(currentTimeSeconds - (computedMinutes * 60 + computedHour * 3600));
      const computedMilliseconds = Math.min(99, 
                                            (Math.floor(currentTimeMilliseconds -
                                                        ((computedSeconds + computedMinutes * 60 + computedHour * 3600) * 1000)) / 10).toFixed(0));
      let displayMilliseconds = utils.timeZeroPad(computedMilliseconds);
      let displaySeconds = utils.timeZeroPad(computedSeconds);
      let displayMinutes = utils.timeZeroPad(computedMinutes);
      let displayHour = utils.timeZeroPad(computedHour);
      const currentTimeFormatted = `${displayMinutes}:${displaySeconds}:${displayMilliseconds}`;
      return(currentTimeFormatted);
    },

    loadCss: (cssPaths) => {
      for (let i in cssPaths) {
        let path = cssPaths[i];
        let previousCssTag = $('#recorder-css-tag-' + i);
        if (previousCssTag.length === 0) {
          // https://stackoverflow.com/questions/18510347/dynamically-load-stylesheets
          const styles = document.createElement('link');
          styles.rel = 'stylesheet';
          styles.id = 'recorder-css-tag-' + i;
          styles.type = 'text/css';
          styles.media = 'screen';
          styles.href = path;
          document.getElementsByTagName('head')[0].appendChild(styles);
        }
      }
    },

    // Thanks for this goes to : https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
    copyToClipboard: (str) => {
      const el = document.createElement('textarea');  // Create a <textarea> element
      el.value = str;                                 // Set its value to the string that you want copied
      el.setAttribute('readonly', '');                // Make it readonly to be tamper-proof
      el.style.position = 'absolute';                 
      el.style.left = '-9999px';                      // Move outside the screen to make it invisible
      document.body.appendChild(el);                  // Append the <textarea> element to the HTML document
      const selected =            
        document.getSelection().rangeCount > 0        // Check if there is any content selected previously
        ? document.getSelection().getRangeAt(0)       // Store selection if found
        : false;                                      // Mark as false to know no selection existed before
      el.select();                                    // Select the <textarea> content
      document.execCommand('copy');                   // Copy - only works as a result of a user action (e.g. click events)
      document.body.removeChild(el);                  // Remove the <textarea> element
      if (selected) {                                 // If a selection existed before copying
        document.getSelection().removeAllRanges();    // Unselect everything on the HTML document
        document.getSelection().addRange(selected);   // Restore the original selection
      }
    },

  }

  return(utils);
});
