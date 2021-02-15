define([
  'components/marked/lib/marked'
], function (marked) {

  const utils = {
    cellMaps: {},
    saveNotebookCallbacks: [],
    saveDebounceTiming: 1000, // Must be slower than 500ms, which is the speed at which jupyter traps save calls stepping on each other. See: 
                              // https://github.com/jupyter/notebook/blob/859ae0ac60456c0e38b44f06852b8a24f8a1cfb0/notebook/static/notebook/js/notebook.js#L2766
    cplusplusKernel11: 'xeus-cling-cpp11',
    cplusplusKernel14: 'xeus-cling-cpp14',
    cplusplusKernel17: 'xeus-cling-cpp17',
    pythonKernel: 'python3',
    rKernel: 'ir',

    addCR: (str) => {
      return str + "\n";
    },

    // This gets the relative path of the notebook from the server root. However, this is deprecated in favor of terminals.discoverPwd for
    // finding the full path of the current notebook.
    getNotebookDirectory: () => {
      const fullNotebookPath = Jupyter.notebook.notebook_path;
      let notebookPath, notebookPathParts;
      if (fullNotebookPath.indexOf('/') === -1) {
        notebookPath = fullNotebookPath;
        if (notebookPath.indexOf('.ipynb') !== -1) {
          notebookPath = undefined; // at the top level, we don't set a CD command
        }
      } else {
        notebookPathParts = fullNotebookPath.split('/');
        notebookPath = notebookPathParts.slice(0,notebookPathParts.length - 1).join('/');
      }
      return notebookPath;
    },

    rerenderMarkdownCell: (cell) => {
      setTimeout(() => {
        cell.unrender();
        cell.render();
      },1); // needing to do this, is really weird. if you don't call this on a timeout, jupyter does not rerender the cell.
    },

    generateUniqueId: () => {
      return 'id_' + Math.random().toString(36).substr(2, 7);
    },

    getNow: () => {
      return new Date().getTime();
    },

    createPermanentStringFromFlag: (flag) => {
      return flag ? 'permanent': 'temporary';
    },

    getCodeCommentString: () => {
      const currentKernelName = Jupyter.notebook.kernel.name;
      let codeCommentString;
      switch (currentKernelName) {
        case utils.cplusplusKernel11:
        case utils.cplusplusKernel14:
        case utils.cplusplusKernel17:
          codeCommentString = '//';
          break;
        case utils.pythonKernel:
        case utils.rKernel:
          codeCommentString = '#';
          break;
      }
      return codeCommentString;
    },

    // These two functions help us translate between what we store in the notebook json itself ('graffitiCellId') and how we use it in the code, just as 'cellId'.
    // This was done to make our tags less likely to collide with other Jupyter plugins, but we wanted to keep the field name short in the Graffiti code.
    getMetadataCellId: (metadata) => {
      return metadata.graffitiCellId;
    },

    setMetadataCellId: (metadata, cellId) => {
      metadata.graffitiCellId = cellId;
      return cellId;
    },

    parseRecordingFullId: (recordingFullId) => {
      const parts = recordingFullId.split('_');
      const recordingCellId = 'id_' + parts[0];
      const recordingKey = 'id_' + parts[1];
      return {
        recordingCellId: recordingCellId,
        recordingKey: recordingKey
      };
    },

    computeArrayAverage: (array) => {
      let average = 0;
      for (let i = 0; i < array.length;++i) {
        average += array[i];
      }
      average = average / array.length;
      return average;      
    },

    subtractCoords: (c1, c2) => {
      const x1 = (c1.x !== undefined ? c1.x : c1.left);
      const y1 = (c1.y !== undefined ? c1.y : c1.top);
      const x2 = (c2.x !== undefined ? c2.x : c2.left);
      const y2 = (c2.y !== undefined ? c2.y : c2.top);
      return { 
        x: x2 - x1, 
        y: y2 - y1
      }
    },

    refreshCodeMirrorSelection: (cell) => {
      if ((cell.cell_type === 'code') && (cell.selected)) {
        cm = cell.code_mirror;
        selections = cm.listSelections();
        cell.focus_cell();
        cm.getInputField().focus();
        cm.setSelections(selections);
      } 
    },

    refreshCodeMirrorSelections: () => {
      const cells = Jupyter.notebook.get_cells();
      let cm,selections;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        utils.refreshCodeMirrorSelection(cell);
      }       
    },

    clearSelectedCellOutput: () => {
      const selectedCell = Jupyter.notebook.get_selected_cell();
      if (selectedCell !== undefined) {
        selectedCell.clear_output();
      }
    },

    composeGraffitiId: (cellId, recordingKey, activeTakeId) => {
      const combinedIds = [cellId.replace('id_',''),recordingKey.replace('id_','')];
      if (activeTakeId !== undefined) {
        combinedIds.push(activeTakeId.replace('id_',''));
      }
      const combinedIdStr = combinedIds.join('_');
      return combinedIdStr;
    },

    // Assign cellIds to any cells that don't have them yet.
    assignCellIds: () => {
      const cells = Jupyter.notebook.get_cells();
      let cell, cellId, i;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        cellId = utils.generateUniqueId();
        if (!cell.metadata.hasOwnProperty('graffitiCellId')) {
          utils.setMetadataCellId(cell.metadata, cellId);
        }
      }
    },

    assignCellGraffitiConfig: (cell, graffitiConfig) => {
      cell.metadata['graffitiConfig'] = graffitiConfig;
    },

    setCellGraffitiConfigEntry: (cell, key, val) => {
      if (!cell.metadata.hasOwnProperty('graffitiConfig')) {
        cell.metadata['graffitiConfig'] = {};
      }
      cell.metadata.graffitiConfig[key] = val;
    },

    getCellGraffitiConfig: (cell) => {
      if (cell.metadata.hasOwnProperty('graffitiConfig')) {
        return cell.metadata['graffitiConfig'];
      }
      return undefined;
    },

    getCellGraffitiConfigEntry: (cell, key) => {
      if (cell.metadata.hasOwnProperty('graffitiConfig')) {
        if (cell.metadata.graffitiConfig.hasOwnProperty(key)) {
          return cell.metadata.graffitiConfig[key];
        }
      }
      return undefined;
    },

    getNotebookGraffitiConfigEntry: (key) => {
      if (Jupyter.notebook.metadata.hasOwnProperty('graffiti')) {
        return Jupyter.notebook.metadata['graffiti'][key];
      }
      return undefined;
    },

    setNotebookGraffitiConfigEntry: (key, val) => {
      if (Jupyter.notebook.metadata.hasOwnProperty('graffiti')) {
        Jupyter.notebook.metadata['graffiti'][key] = val;
      }
    },

    // Also note any graffitis present in this cell, if it is a markdown cell, so that we can process their removal correctly if the user 
    // has moved them from where they were created originally (for instance, graffiti buttons).
    refreshCellMaps: () => {
      utils.cellMaps = {
        cells: Jupyter.notebook.get_cells(),
        maps: {},
        location: {}, // the id of the cell every graffiti is actually currently located in (may not be the cell where it was created)
      }
      let cell, cellId, cellDOM, tagsRe,graffitiId, cellKeys = Object.keys(utils.cellMaps.cells);
      for (let cellIndex = 0; cellIndex < cellKeys.length; ++cellIndex) {
        cell = utils.cellMaps.cells[cellIndex];
        cellId = utils.getMetadataCellId(cell.metadata);
        // Support lookups by cellId.
        utils.cellMaps.maps[cellId] = cellIndex;
        // Dress up the DOM  cellId so we can track selections in them (pretty much only markdown, selections in code_mirror are done through its API
        if (cell.hasOwnProperty('inner_cell')) {
          cellDOM = $(cell.inner_cell).parents('.cell');
        } else if (cell.hasOwnProperty('element')) {
          cellDOM = $(cell.element);
        }
        if (cellDOM !== undefined) {
          cellDOM.attr({ 'graffiti-cell-id' : utils.getMetadataCellId(cell.metadata)});
        }
        if (cell.cell_type === 'markdown') {
          const contents = cell.get_text();
          tagsRe = utils.createGraffitiTagRegex();
          let match, idMatch;
          while ((match = tagsRe.exec(contents)) !== null) { 
            idMatch = match[1].match(/graffiti-(id_.[^\-]+)-(id_[^\s]+)/);
            graffitiId = idMatch[1] + '_' + idMatch[2];
            utils.cellMaps.location[graffitiId] = cellId;
          }        
        }
        //console.trace('cellMaps',utils.cellMaps.location);
      }
    },

    findCellIdByLocationMap: (recordingCellId, recordingKey) => {
      const graffitiId = recordingCellId + '_' + recordingKey;
      if (utils.cellMaps.location[graffitiId] !== undefined) {
        return utils.cellMaps.location[graffitiId];
      }

      return undefined;
    },

    findCellIndexByCellId: (cellId) => {
      if (utils.cellMaps !== undefined && utils.cellMaps.maps !== undefined && utils.cellMaps.maps.hasOwnProperty(cellId)) {
        return utils.cellMaps.maps[cellId];
      }
      return undefined;
    },

    findCellByCellId: (cellId) => {
      const index = utils.findCellIndexByCellId(cellId);
      if (index !== undefined) {
        return utils.cellMaps.cells[index];
      }
      return undefined;
    },


    findCellByCodeMirror: (cm) => {
      for (let cell of utils.cellMaps.cells) {
        if (cell.code_mirror === cm) {
          return cell;
        }
      }
      return undefined;
    },
    
    findCellIndexByCodeMirror: (cm) => {
      for (let cell of utils.cellMaps.cells) {
        if (cell.code_mirror === cm) {
          const cellId = utils.getMetadataCellId(cell.metadata);
          if (cellId !== undefined) {
            return utils.findCellIndexByCellId(cellId);
          }
        }
      }
      return undefined;
    },

    selectCellByCellId: (cellId) => {
      const cellIndex = utils.findCellIndexByCellId(cellId);
      if (cellIndex !== undefined) {
        Jupyter.notebook.select(cellIndex);
      }
    },

    extractRecordingCellId: (selectedTokens) => {
      return ((selectedTokens.tagCellId !== undefined) && 
              (selectedTokens.tagCellId !== selectedTokens.recordingCellId) ? 
              selectedTokens.tagCellId : 
              selectedTokens.recordingCellId);
    },

    getCellRects: (cell) => {
      const cellElement = $(cell.element[0]);
      const cellRect = cellElement[0].getBoundingClientRect();
      const innerCell = cellElement.find('.inner_cell')[0];
      const innerCellRect = innerCell.getBoundingClientRect();
      const prompt = cellElement.find('.prompt')[0];
      const promptRect = prompt.getBoundingClientRect();

      return {
        cellRect: cellRect,
        innerCell: innerCell,
        innerCellRect: innerCellRect,
        promptRect:promptRect
      }
    },

    renderMarkdown: (contents) => {
      // Strip out special commands eg. headline commands and make all hrefs pop new tabs
      const cleanedContents = contents.replace(/^\s*%%(.*)$/mg, '');
      return marked(cleanedContents).replace(/(href=".*")>/g, "$1 target=\"_blank\">");
    },

    collectViewInfo: (clientX, clientY, notebookPanelHeight, scrollDiff) => {
      let cellElement, cellElementJq, cellRect, outerCellRect,
          cellIndex, cellIndexStr, cell, innerCell, innerCellRect, innerCellRectRaw, prompt, 
          pointerPosition, pointerInsidePromptArea, cellPosition, lineNumbersVisible, cm;
      const inputCells = Jupyter.notebook.get_cells();
      const selectedCell = Jupyter.notebook.get_selected_cell();
      const selectedCellId = utils.getMetadataCellId(selectedCell.metadata);
      // handle case where pointer is above all cells or below all cells
      let promptBbox = undefined;
      for (cellIndexStr in inputCells) {
        cellIndex = parseInt(cellIndexStr);
        cell = inputCells[cellIndex];
        cellElement = cell.element[0];
        cellElementJq = $(cellElement);
        cellRect = cellElement.getBoundingClientRect();
        prompt = cellElementJq.find('.prompt');
        pointerInsidePromptArea = false;
        if ((prompt.length > 0) && (prompt.is(':visible'))) {
          promptBbox = prompt[0].getBoundingClientRect();
          pointerInsidePromptArea = ((clientX >= promptBbox.left) && (clientX < promptBbox.right) &&
                                     (clientY >= promptBbox.top)  && (clientY < promptBbox.bottom));
        }
        if ( ((cellRect.top <= clientY) && (clientY <= cellRect.bottom)) ||
             // These are the cases where the pointer is above the first cell or below the last cell
             (((cellIndex === 0) && (clientY < cellRect.top)) ||
              ((cellIndex === inputCells.length - 1) && (cellRect.bottom < clientY))) ) {
          outerCellRect = {
            top: cellRect.top,
            left: cellRect.left
          };
          innerCell = cellElementJq.find('.inner_cell')[0];
          innerCellRectRaw = innerCell.getBoundingClientRect();
          innerCellRect = { 
            top: innerCellRectRaw.top, 
            left: innerCellRectRaw.left, 
            width: innerCellRectRaw.width, 
            height: innerCellRectRaw.height 
          };
          lineNumbersVisible = cell.code_mirror.options.lineNumbers;
          cellPosition = cellElementJq.position();
          cm = cell.code_mirror;
          const innerScrollInfo = cm.getScrollInfo();
          const innerScroll = { left: innerScrollInfo.left, top: innerScrollInfo.top };
          return {
            cellId: utils.getMetadataCellId(cell.metadata), // The id of cell that the pointer is hovering over right now
            cellIndex: cellIndex,
            innerCellRect: innerCellRect,
            innerScroll: innerScroll,
            lineNumbersVisible: lineNumbersVisible,
            outerCellRect: outerCellRect,
            inMarkdownCell: (cell.cell_type === 'markdown'),
            inPromptArea: pointerInsidePromptArea,
            promptWidth: (promptBbox === undefined ? 0 : promptBbox.width),
            selectedCellId: selectedCellId,
            notebookPanelHeight: notebookPanelHeight,
            scrollDiff: scrollDiff
          };
        }
      }
      return { cellId: undefined, cellRectTop: undefined, cellRectBottom: undefined, relativePointerPosition: undefined };

    },

    getActiveCellId: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      return utils.getMetadataCellId(activeCell.metadata);
    },

    getActiveCellLineNumber: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      const cm = activeCell.code_mirror;
      const selections = cm.listSelections();
      const activeLine = selections[0].anchor.line;
      return activeLine;
    },

    queueSaveNotebookCallback: (cb) => {
      utils.saveNotebookCallbacks.push(cb);
    },

    processSaveNotebookCallbacks: () => {
      let cb;
      while (utils.saveNotebookCallbacks.length > 0) {
        cb = utils.saveNotebookCallbacks.shift();
        cb();
      }
      console.log('Graffiti: Notebook saved successfully.');
    },

    saveNotebook: () => {
      Jupyter.notebook.save_notebook().then(() => {
        utils.processSaveNotebookCallbacks();
      }).catch((ex) => {
        console.error('Graffiti: saveNotebook caught exception:', ex);
      });
    },

    // You can delete this, it's no longer needed now that we call cell.focus_cell() when we change selections
    shrinkAllCMSelections: () => {
      const inputCells = Jupyter.notebook.get_cells();
      let cell,cm,selections;
      for (let i = 0; i < inputCells.length; ++i) {
        cell = inputCells[i];       
        if (cell.cell_type === 'code') {
          cm = cell.code_mirror;
          selections = cm.listSelections();
          if (selections.length > 0) {
            console.log('Graffiti: Clearing selections before: selections:', selections);
            for (let j = 0; j < selections.length; ++j) {
              selections[j].head = $.extend({}, selections[j].anchor);
            }
            console.log('Graffiti: Clearing selections after: selections:', selections);
            cm.setSelections(selections);
          }
        }
      }
    },

    // Legacy
    /*
       collectTokenStrings: (allTokens, tokens) => {
       const subTokens = allTokens.slice(tokens.firstTokenOffset, tokens.firstTokenOffset + tokens.extraTokens + 1);
       return subTokens.reduce( (tokensString, token) => { tokensString + token.string } )
       },
     */

    createGraffitiTagRegex: () => {
      return RegExp('<span class="graffiti-highlight (graffiti-[^"]+)">(.*?)</span>','gm');
    },

    // Find out whether the current selection intersections with any graffiti token ranges, or which tokens are in the selection if not.
    findSelectionTokens: (recordingCell,  tokenRanges, state) => {
      //console.log('findSelectionTokens, tokenRanges:', tokenRanges);
      let range, startRange, endRange, recording, hasMovie, recordingKey, markdown, isIntersecting = false;
      const recordingCellId = utils.getMetadataCellId(recordingCell.metadata);
      const recordingCellType = recordingCell.cell_type;
      const cm = recordingCell.code_mirror;
      const selections = cm.listSelections();
      const firstSelection = selections[0];
      const anchorPos = cm.indexFromPos(firstSelection.anchor);
      const headPos = cm.indexFromPos(firstSelection.head);
      let startPos = Math.min(anchorPos, headPos);
      let endPos = Math.max(anchorPos, headPos);
      let minStartRange = 1000000000;
      const noResults = { isIntersecting: false, noTokensPresent: true };
      let results = noResults;

      if (recordingCellType === 'markdown') {
        // If in a markdown cell, the selection "tokens" are simply the selection, but only if the selection is 2 characters or more. We do not try to use
        // code mirror's tokenizer tools within markdown cells as there's other stuff like html in a markdown cell that could be confusing to it.
        const contents = recordingCell.get_text();
        let tagsRe = utils.createGraffitiTagRegex();
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
            hasMovie = recording.hasMovie;
            results = {
              isIntersecting: true,
              noTokensPresent: false,
              recordingCell: recordingCell,
              recordingCellId: recordingCellId,
              // If the graffiti was moved around, then the cell id in its tag won't match the cell where it's found. 
              // We store this here to detect this situation so we can track down the graffiti recording that used to be in a different cell.
              tagCellId: tag.recordingCellId, 
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
          // Now check for a selection in the markdown cm cell.
          if (endPos > startPos + 1) { // 2 or more chars is in the selection; this way we disallow Graffitis applied to just CR's
            // Move startPos forward past markdown-significant characters, because if we put a graffiti around the markdown indicators, they will lose their markdown significance.
            let skipped = false;
            let checkChar = contents[startPos];
            const skipChars = '#_*'; // note: we do not include backticks, even though they are significant to markdown, as we want them inside our selected text for the graffiti spans.
            while ((skipChars.indexOf(checkChar) !== -1) && (startPos < endPos)) {
              skipped = true;
              startPos++;
              checkChar = contents[startPos];
            }
            if (skipped && (contents[startPos] === ' ')) {
              // skip past the space after hashtags
              ++startPos;
            }
            // expand the range to include surrounding backticks
            if (startPos > 0) {
              if (contents[startPos - 1] === '`') {
                startPos--;
              }
            }
            if (endPos < contents.length - 1) {
              if (contents[endPos + 1] === '`') {
                endPos++;
              }
            }
            // Backup from a cr. this may happen if the user triple clicked on a line and absorbed the cr. we don't want that.
            //console.log('Check for backing up:-->', contents.substring(startPos,endPos), '<--');
            //console.log('code:', contents[endPos].charCodeAt(0), 'code-1:', contents[endPos-1].charCodeAt(0));
            while (contents[endPos-1].charCodeAt(0) === 10) {
              //console.log('backing up, -->', contents[endPos], '<--,', contents[endPos-1].charCodeAt(0) );
              endPos--;
              if (endPos === startPos + 2) {
                break;
              }
            }
            //console.log('selection will be:', contents.substring(startPos,endPos), '<--', contents[endPos].charCodeAt(0));
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
        //console.log('final results:',results);
      } else if (recordingCellType === 'code') {
        // If in a code cell, try to find tokens in and around the selection.
        if (tokenRanges[recordingCellId] !== undefined) {
          const tokenRangesThisCell = tokenRanges[recordingCellId];
          for (recordingKey of Object.keys(tokenRangesThisCell)) {
            range = tokenRangesThisCell[recordingKey];
            startRange = cm.indexFromPos(range.start);
            endRange = cm.indexFromPos(range.end);
            // console.log('startPos:', startPos, 'endPos:', endPos, '| startRange:', startRange, 'endRange:', endRange, 'range:', range);
            if ((startPos <= startRange && endPos >= endRange) || // selection surrounds or equals the range
                ((startPos >= startRange && startPos < endRange) || (endPos > startRange && endPos <= endRange))) { // selection is inside the range
              if (startRange < minStartRange) {
                minStartRange = startRange;
                recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
                if (recording) {
                  markdown = recording.markdown;
                  hasMovie = recording.hasMovie;
                  //console.log('found range:', range);
                  isIntersecting = true;
                  results = {
                    isIntersecting: true,
                    noTokensPresent: false,
                    recordingCell: recordingCell,
                    recordingCellId: recordingCellId,
                    recordingKey: recordingKey, 
                    markdown: markdown,
                    hasMovie: hasMovie,
                    range: {
                      start: startRange,
                      end:   endRange
                    }
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
          let startCheck, endCheck, token, startToken, endToken, lastToken, startTokenIndex, startTokenStringTrimmed, tokenCount = 0, tokensString = '';
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
                  startTokenStringTrimmed = $.trim(token.string);
                  if ((startTokenStringTrimmed.length > 0) &&
                      ((startPos >= startCheck && startPos <= endCheck) ||
                       (endPos >= startCheck && endPos <= endCheck))) {
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
                    end:   cm.indexFromPos({line:endToken.line, ch: endToken.ch}),
                    selectionStart: startPos,
                    selectionEnd: endPos
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
      if (startToken === undefined) {
        return undefined; // couldn't find start token, degenerate case, can only happen if a graffiti has a corrupted startToken.
      }
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

    formatTime: (currentTimeMilliseconds, opts) => {
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
      let currentTimeFormatted;
      if (opts.includeMillis) {
        currentTimeFormatted = `${displayMinutes}:${displaySeconds}:${displayMilliseconds}`;
      } else {
        currentTimeFormatted = `${displayMinutes}:${displaySeconds}`;
      }
      return(currentTimeFormatted);
    },

    reworkFetchPathForVirtualHosts: (path) => {
      // Rework fetch paths on hosts like binder.org, where there is some additional virtual path between document.origin
      // and the path to the notebook. If a relative path, keep "notebook" in the path; otherwise start
      // any absolute path from *after* document.location.origin + virtual path.
      const loc = document.location;
      const urlPathName = loc.pathname;
      const hasNotebooks = (urlPathName.indexOf('/notebooks/') > -1);
      const leadingSlash = (path[0] === '/');
      let pathMiddle = '', parts;
      if (hasNotebooks) {
        pathMiddle = (leadingSlash ? '' : '/notebooks/');
        parts = urlPathName.split(/\/notebooks\//,2);
      }
      const reworkedPath = loc.origin + (parts[0].length > 0 ? parts[0] + pathMiddle + path : pathMiddle + path);
      return reworkedPath;
    },

    loadCss: (cssPaths) => {
      let path, reworkedPath, previousCssTag;
      for (let i in cssPaths) {
        path = cssPaths[i];
        reworkedPath = utils.reworkFetchPathForVirtualHosts(path);

        previousCssTag = $('#recorder-css-tag-' + i);
        if (previousCssTag.length === 0) {
          // https://stackoverflow.com/questions/18510347/dynamically-load-stylesheets
          const styles = document.createElement('link');
          styles.rel = 'stylesheet';
          styles.id = 'recorder-css-tag-' + i;
          styles.type = 'text/css';
          styles.media = 'screen';
          styles.href = reworkedPath;
          document.getElementsByTagName('head')[0].appendChild(styles);
        }
      }
    },

    // https://stackoverflow.com/a/18284182/2767287
    getViewportSize: (w) => {
      // Use the specified window or the current window if no argument
      w = w || window;

      // This works for all browsers except IE8 and before
      if (w.innerWidth != null) return { w: w.innerWidth, h: w.innerHeight };

      // For IE (or any browser) in Standards mode
      var d = w.document;
      if (document.compatMode == "CSS1Compat")
        return { w: d.documentElement.clientWidth,
                 h: d.documentElement.clientHeight };

      // For browsers in Quirks mode
      return { w: d.body.clientWidth, h: d.body.clientHeight };

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

    isUdacityEnvironment: () => {
      const host = location.hostname;
      if (host.endsWith('udacity.com') || 
          host.endsWith('udacity-student-workspaces.com')) {
        return true;
      }
      return false;
    },

    createApiSymlink: () => {
      if (!utils.isUdacityEnvironment()) {
        return;
      }
      // Create a symlink to get 'import jupytergraffiti' working in Udacity environment
      const graffitiPath = '/opt/workspace-jupyter-graffiti/jupytergraffiti';
      const createSymlinkCmd = `ln -sf ${graffitiPath} jupytergraffiti`;

      // Create a python file and execute the file 
      let importApiScript = '';
      // Adding /opt/jupytergraffiti to system path allows us to import it as a python module
      importApiScript += 'import sys\\n';
      importApiScript += 'api_path="'+ graffitiPath +'"\\n';
      importApiScript += 'if api_path not in sys.path:\\n';
      importApiScript += '  sys.path.insert(0,api_path)\\n';
      const executePythonScript = `!${createSymlinkCmd} && echo '${importApiScript}' > /tmp/graffiti-symlink.py && python /tmp/graffiti-symlink.py`;
      const scriptOptions = {
        silent: false,
        store_history: false,
        stop_on_error : true
      }
      
      Jupyter.notebook.kernel.execute(executePythonScript, undefined, scriptOptions);
    },

    // Detect if operating system is Windows. This method will only work on notebooks with python kernels!
    onWindowsOS: () => {
      const platform = navigator.platform;
      if ((platform.indexOf('Win') === 0) ||
          (platform.indexOf('win') === 0)) {
        console.log('Graffiti: Windows OS detected.');
        return true;
      }
      return false;
    },

    onSafari: () => {
      const vendor = navigator.vendor;
      if ((vendor) && (vendor === "Apple Computer, Inc.")) {
        console.log('Safari detected.');
        return true;
      }
      return false;
    }

  }

  utils.saveNotebookDebounced = _.debounce(utils.saveNotebook, utils.saveDebounceTiming, false);

  return(utils);
});
