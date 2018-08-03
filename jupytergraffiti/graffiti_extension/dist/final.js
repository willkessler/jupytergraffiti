// Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
// This work is free. You can redistribute it and/or modify it
// under the terms of the WTFPL, Version 2
// For more information see LICENSE.txt or http://www.wtfpl.net/
//
// For more information, the home page:
// http://pieroxy.net/blog/pages/lz-string/testing.html
// https://github.com/pieroxy/lz-string/blob/master/libs/lz-string.js
//
// LZ-based compression algorithm, version 1.4.4
var LZString = (function() {

  // private property
  var f = String.fromCharCode;
  var keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
  var baseReverseDic = {};

  function getBaseValue(alphabet, character) {
    if (!baseReverseDic[alphabet]) {
      baseReverseDic[alphabet] = {};
      for (var i=0 ; i<alphabet.length ; i++) {
        baseReverseDic[alphabet][alphabet.charAt(i)] = i;
      }
    }
    return baseReverseDic[alphabet][character];
  }

  var LZString = {
    compressToBase64 : function (input) {
      if (input == null) return "";
      var res = LZString._compress(input, 6, function(a){return keyStrBase64.charAt(a);});
      switch (res.length % 4) { // To produce valid Base64
        default: // When could this happen ?
        case 0 : return res;
        case 1 : return res+"===";
        case 2 : return res+"==";
        case 3 : return res+"=";
      }
    },

    decompressFromBase64 : function (input) {
      if (input == null) return "";
      if (input == "") return null;
      return LZString._decompress(input.length, 32, function(index) { return getBaseValue(keyStrBase64, input.charAt(index)); });
    },

    compressToUTF16 : function (input) {
      if (input == null) return "";
      return LZString._compress(input, 15, function(a){return f(a+32);}) + " ";
    },

    decompressFromUTF16: function (compressed) {
      if (compressed == null) return "";
      if (compressed == "") return null;
      return LZString._decompress(compressed.length, 16384, function(index) { return compressed.charCodeAt(index) - 32; });
    },

    //compress into uint8array (UCS-2 big endian format)
    compressToUint8Array: function (uncompressed) {
      var compressed = LZString.compress(uncompressed);
      var buf=new Uint8Array(compressed.length*2); // 2 bytes per character

      for (var i=0, TotalLen=compressed.length; i<TotalLen; i++) {
        var current_value = compressed.charCodeAt(i);
        buf[i*2] = current_value >>> 8;
        buf[i*2+1] = current_value % 256;
      }
      return buf;
    },

    //decompress from uint8array (UCS-2 big endian format)
    decompressFromUint8Array:function (compressed) {
      if (compressed===null || compressed===undefined){
        return LZString.decompress(compressed);
      } else {
        var buf=new Array(compressed.length/2); // 2 bytes per character
        for (var i=0, TotalLen=buf.length; i<TotalLen; i++) {
          buf[i]=compressed[i*2]*256+compressed[i*2+1];
        }

        var result = [];
        buf.forEach(function (c) {
          result.push(f(c));
        });
        return LZString.decompress(result.join(''));

      }

    },


    //compress into a string that is already URI encoded
    compressToEncodedURIComponent: function (input) {
      if (input == null) return "";
      return LZString._compress(input, 6, function(a){return keyStrUriSafe.charAt(a);});
    },

    //decompress from an output of compressToEncodedURIComponent
    decompressFromEncodedURIComponent:function (input) {
      if (input == null) return "";
      if (input == "") return null;
      input = input.replace(/ /g, "+");
      return LZString._decompress(input.length, 32, function(index) { return getBaseValue(keyStrUriSafe, input.charAt(index)); });
    },

    compress: function (uncompressed) {
      return LZString._compress(uncompressed, 16, function(a){return f(a);});
    },
    _compress: function (uncompressed, bitsPerChar, getCharFromInt) {
      if (uncompressed == null) return "";
      var i, value,
          context_dictionary= {},
          context_dictionaryToCreate= {},
          context_c="",
          context_wc="",
          context_w="",
          context_enlargeIn= 2, // Compensate for the first entry which should not count
          context_dictSize= 3,
          context_numBits= 2,
          context_data=[],
          context_data_val=0,
          context_data_position=0,
          ii;

      for (ii = 0; ii < uncompressed.length; ii += 1) {
        context_c = uncompressed.charAt(ii);
        if (!Object.prototype.hasOwnProperty.call(context_dictionary,context_c)) {
          context_dictionary[context_c] = context_dictSize++;
          context_dictionaryToCreate[context_c] = true;
        }

        context_wc = context_w + context_c;
        if (Object.prototype.hasOwnProperty.call(context_dictionary,context_wc)) {
          context_w = context_wc;
        } else {
          if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
            if (context_w.charCodeAt(0)<256) {
              for (i=0 ; i<context_numBits ; i++) {
                context_data_val = (context_data_val << 1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
              }
              value = context_w.charCodeAt(0);
              for (i=0 ; i<8 ; i++) {
                context_data_val = (context_data_val << 1) | (value&1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            } else {
              value = 1;
              for (i=0 ; i<context_numBits ; i++) {
                context_data_val = (context_data_val << 1) | value;
                if (context_data_position ==bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = 0;
              }
              value = context_w.charCodeAt(0);
              for (i=0 ; i<16 ; i++) {
                context_data_val = (context_data_val << 1) | (value&1);
                if (context_data_position == bitsPerChar-1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn == 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
            delete context_dictionaryToCreate[context_w];
          } else {
            value = context_dictionary[context_w];
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }


          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          // Add wc to the dictionary.
          context_dictionary[context_wc] = context_dictSize++;
          context_w = String(context_c);
        }
      }

      // Output the code for w.
      if (context_w !== "") {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate,context_w)) {
          if (context_w.charCodeAt(0)<256) {
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
            }
            value = context_w.charCodeAt(0);
            for (i=0 ; i<8 ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          } else {
            value = 1;
            for (i=0 ; i<context_numBits ; i++) {
              context_data_val = (context_data_val << 1) | value;
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = 0;
            }
            value = context_w.charCodeAt(0);
            for (i=0 ; i<16 ; i++) {
              context_data_val = (context_data_val << 1) | (value&1);
              if (context_data_position == bitsPerChar-1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
              } else {
                context_data_position++;
              }
              value = value >> 1;
            }
          }
          context_enlargeIn--;
          if (context_enlargeIn == 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
          }
          delete context_dictionaryToCreate[context_w];
        } else {
          value = context_dictionary[context_w];
          for (i=0 ; i<context_numBits ; i++) {
            context_data_val = (context_data_val << 1) | (value&1);
            if (context_data_position == bitsPerChar-1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }


        }
        context_enlargeIn--;
        if (context_enlargeIn == 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
      }

      // Mark the end of the stream
      value = 2;
      for (i=0 ; i<context_numBits ; i++) {
        context_data_val = (context_data_val << 1) | (value&1);
        if (context_data_position == bitsPerChar-1) {
          context_data_position = 0;
          context_data.push(getCharFromInt(context_data_val));
          context_data_val = 0;
        } else {
          context_data_position++;
        }
        value = value >> 1;
      }

      // Flush the last char
      while (true) {
        context_data_val = (context_data_val << 1);
        if (context_data_position == bitsPerChar-1) {
          context_data.push(getCharFromInt(context_data_val));
          break;
        }
        else context_data_position++;
      }
      return context_data.join('');
    },

    decompress: function (compressed) {
      if (compressed == null) return "";
      if (compressed == "") return null;
      return LZString._decompress(compressed.length, 32768, function(index) { return compressed.charCodeAt(index); });
    },

    _decompress: function (length, resetValue, getNextValue) {
      var dictionary = [],
          next,
          enlargeIn = 4,
          dictSize = 4,
          numBits = 3,
          entry = "",
          result = [],
          i,
          w,
          bits, resb, maxpower, power,
          c,
          data = {val:getNextValue(0), position:resetValue, index:1};

      for (i = 0; i < 3; i += 1) {
        dictionary[i] = i;
      }

      bits = 0;
      maxpower = Math.pow(2,2);
      power=1;
      while (power!=maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position == 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb>0 ? 1 : 0) * power;
        power <<= 1;
      }

      switch (next = bits) {
        case 0:
          bits = 0;
          maxpower = Math.pow(2,8);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
          c = f(bits);
          break;
        case 1:
          bits = 0;
          maxpower = Math.pow(2,16);
          power=1;
          while (power!=maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb>0 ? 1 : 0) * power;
            power <<= 1;
          }
          c = f(bits);
          break;
        case 2:
          return "";
      }
      dictionary[3] = c;
      w = c;
      result.push(c);
      while (true) {
        if (data.index > length) {
          return "";
        }

        bits = 0;
        maxpower = Math.pow(2,numBits);
        power=1;
        while (power!=maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position == 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb>0 ? 1 : 0) * power;
          power <<= 1;
        }

        switch (c = bits) {
          case 0:
            bits = 0;
            maxpower = Math.pow(2,8);
            power=1;
            while (power!=maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position == 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
              }
              bits |= (resb>0 ? 1 : 0) * power;
              power <<= 1;
            }

            dictionary[dictSize++] = f(bits);
            c = dictSize-1;
            enlargeIn--;
            break;
          case 1:
            bits = 0;
            maxpower = Math.pow(2,16);
            power=1;
            while (power!=maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position == 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
              }
              bits |= (resb>0 ? 1 : 0) * power;
              power <<= 1;
            }
            dictionary[dictSize++] = f(bits);
            c = dictSize-1;
            enlargeIn--;
            break;
          case 2:
            return result.join('');
        }

        if (enlargeIn == 0) {
          enlargeIn = Math.pow(2, numBits);
          numBits++;
        }

        if (dictionary[c]) {
          entry = dictionary[c];
        } else {
          if (c === dictSize) {
            entry = w + w.charAt(0);
          } else {
            return null;
          }
        }
        result.push(entry);

        // Add w+entry[0] to the dictionary.
        dictionary[dictSize++] = w + entry.charAt(0);
        enlargeIn--;

        w = entry;

        if (enlargeIn == 0) {
          enlargeIn = Math.pow(2, numBits);
          numBits++;
        }

      }
    }
  };
  return LZString;
})();

if (typeof define === 'function' && define.amd) {
  define(function () { return LZString; });
} else if( typeof module !== 'undefined' && module != null ) {
  module.exports = LZString
} else if( typeof angular !== 'undefined' && angular != null ) {
  angular.module('LZString', [])
         .factory('LZString', function () {
           return LZString;
         });
}

define([
  'components/marked/lib/marked'
], function (marked) {

  const utils = {
    generateUniqueId: () => {
      return 'id-' + Math.random().toString(36).substr(2, 16);
    },

    getNow: () => {
      return new Date().getTime();
    },

    findCellByCellId: (cellId) => {
      const inputCells = Jupyter.notebook.get_cells();
      for (let cell of inputCells) {
        if (cell.metadata.hasOwnProperty('cellId') && cell.metadata.cellId === cellId) {
          return cell;
        }
      }
      return undefined;
    },

    // refactor this to use hash for faster lookup
    findCellIndexByCellId: (cellId) => {
      const inputCells = Jupyter.notebook.get_cells();
      for (let cellIndex of Object.keys(inputCells)) {
        if (inputCells[cellIndex].metadata.hasOwnProperty('cellId') && inputCells[cellIndex].metadata.cellId === cellId) {
          // console.log('Found cellIndex:', cellIndex);
          return parseInt(cellIndex);
        }
      }
      return undefined;
    },

    findCellByCodeMirror: (cm) => {
      const inputCells = Jupyter.notebook.get_cells();
      for (let cell of inputCells) {
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
      Jupyter.notebook.save_notebook().then( () => { void 0 });
    },

    collectTokenStrings: (allTokens, tokens) => {
      const subTokens = allTokens.slice(tokens.firstTokenOffset, tokens.firstTokenOffset + tokens.extraTokens + 1);
      
      return subTokens.reduce( (tokensString, token) => { tokensString + token.string } )
    },

    // Find out whether the current selection intersections with any annotation token ranges, or which tokens are in the selection if not.
    findSelectionTokens: (recordingCell,  tokenRanges, state) => {
      //console.log('findSelectionTokens, tokenRanges:', tokenRanges);
      let range, startRange, endRange, recordingKey, markdown, isIntersecting = false;
      const recordingCellId = recordingCell.metadata.cellId;
      const cm = recordingCell.code_mirror;
      const selections = cm.listSelections();
      const firstSelection = selections[0];
      const anchorPos = cm.indexFromPos(firstSelection.anchor);
      const headPos = cm.indexFromPos(firstSelection.head);
      const startPos = Math.min(anchorPos, headPos);
      const endPos = Math.max(anchorPos, headPos);
      let minStartRange = 1000000000;

      if (tokenRanges[recordingCellId] !== undefined) {
        const tokenRangesThisCell = tokenRanges[recordingCellId];
        for (recordingKey of Object.keys(tokenRangesThisCell)) {
          range = tokenRangesThisCell[recordingKey];
          startRange = cm.indexFromPos(range.start);
          endRange = cm.indexFromPos(range.end);
          //console.log('startPos:', startPos, 'endPos:', endPos, '| startRange:', startRange, 'endRange:', endRange, 'range:', range);
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
                start: startRange,
                end:   endRange
              };
            }
          }
        }
      }
      if (!isIntersecting) {
        // we didn't find a match within existing recordings. See what tokens are selected overall in that case.
        //console.log('not intersecting, now checking for new annots');
        const allTokens = utils.collectCMTokens(cm);
        let startCheck, endCheck, token, startToken, lastToken, startTokenIndex, tokenCount = 0, tokensString = '';
        if (allTokens.length === 0) {
          // degnerate case 1: no tokens present at all in the cell
          results = {
            isIntersecting: false,
            noTokensPresent : true
          };
        } else {
          token = allTokens[allTokens.length - 1];
          endCheck = cm.indexFromPos({line: token.line, ch: token.end});
          if (startPos > endCheck) {
            // degenerate case 2: selection caret is past the last token present
            results = {
              isIntersecting: false,
              noTokensPresent : true
            };
          } else {
            for (let i = 0; i < allTokens.length; ++i) {
              lastToken = token;
              token = allTokens[i];
              startCheck = cm.indexFromPos({line: token.line, ch: token.start});
              endCheck = cm.indexFromPos({line: token.line, ch: token.end});
              //console.log('startPos, endPos:', startPos, endPos, 'checking token:', token.string, startCheck, endCheck);
              if (startToken === undefined) {
                if (startPos >= startCheck && startPos <= endCheck) {
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
                  startToken = lastToken; // if between tokens, take last token seen
                  endToken = lastToken;
                }
                break;
              }
            }
            
            // Find the occurence count of the first token in the code cell, e.g. if the token is the second "hello" in "hello there, mr. hello dude"
            //console.log('startPos, endPos:', startPos, endPos, 'startToken,endToken:', startToken,endToken);
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

            results = {
              isIntersecting: false,
              noTokensPresent: false,
              tokens: {
                start: {
                  type: startToken.type,
                  string: startToken.string,
                  offset: startToken.offset
                },
                count: tokenCount,
                allTokensString: tokensString            
              },
              start: cm.indexFromPos({line:startToken.line, ch: startToken.ch}),
              end:   cm.indexFromPos({line:endToken.line, ch: endToken.ch})
            }
          }
        }
      }

      //console.log('findIntersectingRange results:', results);
      return results;
    },

    // Collect all tokens in code-mirror into an array and tag each with which line it's found on. We use this 
    // in refreshAnnotationHighlights() as we mark up a cell with existing recorded annotations.
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
    // out of the given code mirror instance (since those ranges might have changed since the annotation was first created).
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
      const computedMilliseconds = (Math.floor(currentTimeMilliseconds - ((computedSeconds + computedMinutes * 60 + computedHour * 3600) * 1000)) / 10).toFixed(0);
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

define([
  './state.js',
  './audio.js',
  './utils.js',
  './LZString.js'
], function (state,audio,utils, LZString) {

  const storage = {
    constructMoviePath: (recordingCellId, recordingKey) => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('recordingId')) {
        notebook.metadata['recordingId'] = utils.generateUniqueId();
      }
      const notebookRecordingId = notebook.metadata['recordingId'];
      const dirName = "recording_data/" +
                      notebookRecordingId.replace('-','_') + '/' +
                      recordingCellId.replace('-','_') + '/' +
                      recordingKey;
      return dirName;
    },

    clearStorageInProcess: () => {
      const recordingCellInfo = state.getRecordingCellInfo();
      const recording = state.getManifestSingleRecording(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
      if (recording !== undefined) {
        recording.inProgress = false;
        recording.hasMovie = state.getMovieRecordingStarted();
      }
      state.setStorageInProcess(false);
      state.setMovieRecordingStarted(false);
      void 0;
      storage.storeManifest('author');
      utils.saveNotebook();
    },

    storeMovie: () => {
      state.setStorageInProcess(true);
      const recordingCellInfo = state.getRecordingCellInfo();

      const notebook = Jupyter.notebook;
      const jsonHistory = state.getJSONHistory();
      void 0;
      const base64CompressedHistory = LZString.compressToBase64(jsonHistory);
      const encodedAudio = audio.getRecordedAudio();

      const numCells = Jupyter.notebook.get_cells().length;
      const recordingMetaData = {
        duration: state.getHistoryDuration()
      };
      const dirName = storage.constructMoviePath(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
      const jsonMeta = JSON.stringify(recordingMetaData).replace(/\"/g,'\\"');
      let bashScript = "import os\n";
      bashScript += 'os.system("mkdir -p ' + dirName + '")' + "\n";
      bashScript += "with open('" + dirName + '/' + "audio.txt', 'w') as f:\n";
      bashScript += "    f.write('" + encodedAudio + "')\n";
      bashScript += "with open('" + dirName + '/' + "history.txt', 'w') as f:\n";
      bashScript += "    f.write('" + base64CompressedHistory + "')\n";
      bashScript += "with open('" + dirName + '/' + "meta.json', 'w') as f:\n";
      bashScript += "    f.write('" + jsonMeta + "')\n";
      void 0;
      Jupyter.notebook.kernel.execute(bashScript,
                                      undefined,
                                      {
                                        silent: false,
                                        store_history: false,
                                        stop_on_error : true
                                      });

    },

    // Load the manifest for this notebook.
    // Manifests contain information about all the recordings present in this notebook.
    // mode is either 'author' or 'student-<123>' where <123> is the id of a student's graffiti.
    // This version of the system only supports author manaifests.
    loadManifest: (mode) => {
      const notebookRecordingId = Jupyter.notebook.metadata['recordingId'];
      let manifestPath = 'recording_data/manifests/';
      if (mode === 'author') {
        manifestPath += 'author/manifest_' + notebookRecordingId.replace('-','_').replace('id_','') + '.json';
      } else {
        void 0;
        return;
      }
      void 0;
      const credentials = { credentials: 'include' };

      return fetch(manifestPath, credentials).then((response) => {
        if (!response.ok) {
          // We could not fetch for some reason (maybe manifest file doesn't exist) so initialize an empty manifest
          return(undefined);
        }
        return response.text();
      }).then((base64Str) => {
        if (base64Str === undefined) {
          state.setManifest({});
        } else {
          const uncompressedManifestString = LZString.decompressFromBase64(base64Str);
          const manifestDataParsed = JSON.parse(uncompressedManifestString);
          state.setManifest(manifestDataParsed);
        }
      });
    },

    storeManifest: (mode, studentId) => {
      const manifest = state.getManifest();
      const notebookRecordingId = Jupyter.notebook.metadata['recordingId'];
      let manifestPath = "recording_data/manifests/", manifestFile;
      if (mode === 'author') {
        manifestPath += "author";
        manifestFile = "manifest_" + notebookRecordingId.replace('-','_').replace('id_','') + '.json';
      } else {
        void 0;
        return;
      }
      manifestPath += '/';
      void 0;
      let bashScript = "import os\n";
      const base64CompressedManifest = LZString.compressToBase64(JSON.stringify(manifest));
      bashScript += 'os.system("mkdir -p ' + manifestPath + '")' + "\n";
      bashScript += "with open('" + manifestPath + manifestFile + "', 'w') as f:\n";
      bashScript += "    f.write('" + base64CompressedManifest + "')\n";
      void 0;
      Jupyter.notebook.kernel.execute(bashScript,
                                      undefined,
                                      {
                                        silent: false,
                                        store_history: false,
                                        stop_on_error : true
                                      });

      },

    //
    // Load a movie.
    // Returns a promise.
    //
    loadMovie: (recordingCellId, recordingId) => {

      // This optimization may be causing a bug where the wrong movie plays.
      //      if (recordingId === state.getCurrentRecordingId()) {
      //        return Promise.resolve();
      //      }

      state.setCurrentRecordingId(recordingId);
      const notebookRecordingId = Jupyter.notebook.metadata['recordingId'];
      const dirName = "./recording_data/" + notebookRecordingId.replace('-', '_') + '/' + recordingCellId.replace('-','_')  + '/' + recordingId;
      const metaUrl = dirName + '/meta.json';
      const credentials = { credentials: 'include'};
      storage.successfulLoad = false; /* assume we cannot fetch this recording ok */
      void 0;
      return fetch(metaUrl, credentials).then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json();
      }).then((metaInfo) => {
        const historyUrl = dirName + '/history.txt';
        return fetch(historyUrl, credentials).then((response) => {
          if (!response.ok) {
            throw Error(response.statusText);
          }
          return response.text();
        }).then(function(base64CompressedHistory) {
          try {
            //console.log('Loaded history:', base64CompressedHistory);
            const uncompressedHistory = LZString.decompressFromBase64(base64CompressedHistory);
            const parsedHistory = JSON.parse(uncompressedHistory);
            state.storeWholeHistory(parsedHistory);
            void 0;
            void 0;
            const audioUrl = dirName + '/audio.txt';
            return fetch(audioUrl, { credentials: 'include' }).then((response) => {
              if (!response.ok) {
                throw Error(response.statusText);
              }
              return response.text();
            }).then(function(base64CompressedAudio) {
              try {
                audio.setRecordedAudio(base64CompressedAudio);
                storage.successfulLoad = true;
                state.setCurrentRecordingId(recordingId);
              } catch(ex) {
                void 0;
              }
            });
          } catch (ex) {
            void 0;
          }
        });
      }).catch((ex) => {
        void 0;
        return Promise.reject('Could not fetch metadata file');
      });
    },

    deleteMovie: (recordingCellId, recordingId) => {
      const dirName = storage.constructMoviePath(recordingCellId, recordingId);
      const deletePython = "import os\nos.system('rm -r " + dirName + "')\n";
      void 0;

      this.Jupyter.notebook.kernel.execute(deletePython,
                                           undefined,
                                           {
                                             silent: false,
                                             store_history: false,
                                             stop_on_error : true
                                           });


    },

  }

  return(storage);
});

define([
  './state.js',
], function (state) {

  const audio = {

    init: (state) => {
      if (!state.recordingActive) {
        return;
      }

      void 0;
      // fork getUserMedia for multiple browser versions, for the future
      // when more browsers support MediaRecorder
      navigator.getUserMedia = ( navigator.getUserMedia ||
                                 navigator.webkitGetUserMedia ||
                                 navigator.mozGetUserMedia ||
                                 navigator.msGetUserMedia);

      if (navigator.getUserMedia) {
        //console.log('getUserMedia supported.');
        navigator.getUserMedia (
          { // constraints - only audio needed for this app
            audio: true
          },
          // Success callback
          function(stream) {
            const mediaRecorder = new MediaRecorder(stream);
      	    mediaRecorder.ondataavailable = audio.saveRecordedAudio;
            audio.storeMediaRecorder(mediaRecorder);
          },

          // Error callback
          function(err) {
            void 0;
          }
        )
      } else {
        void 0;
      }
    },

    storeMediaRecorder: (mediaRecorder) => {
      audio.mediaRecorder = mediaRecorder;
      void 0;
    },
    
    storeAudio: (audioObj) => {
      audio.audioObj = audioObj;
    },

    playAudio: (elapsedTime) => {
      audio.setAudioPosition(elapsedTime);
      audio.audioObj.play();
    },

    pauseAudio: () => {
      audio.audioObj.pause();
    },

    // Set time of audio clip, cf:
    // http://stackoverflow.com/questions/9563887/setting-html5-audio-position
    setAudioPosition: (elapsedTime) => {
      audio.audioObj.currentTime = elapsedTime / 1000; // note that we keep elapsed time in ms, but the MSDN API wants currentTime in seconds
    },

    storeRecordedAudio: (base64String) => {
      // console.log('storing audio base64String :', base64String);
      audio.recordedAudioString = base64String;
    },

    getRecordedAudio: () => {
      return(audio.recordedAudioString || '');
    },

    setRecordedAudio: (b64String) => {
      //console.log('Fetching from ', b64String);
      const labeledAudio = 'data:video/webm;base64,' + b64String;
      const audioObj = new Audio(labeledAudio);
      audioObj.load();
      audio.storeAudio(audioObj);
    },

    setAudioStorageCallback: (cb) => {
      audio.audioStorageCallback = cb;
    },

    startRecording: () => {
      audio.mediaRecorder.start();
      void 0;
      void 0;
    },

    stopRecording: () => {
      audio.mediaRecorder.stop();
      void 0;
    },

    startPlayback: (elapsedTime) => {
      audio.playAudio(elapsedTime);
    },

    stopPlayback: () => {
      audio.pauseAudio();
    },

    saveRecordedAudio: (e) => {
      //console.log("Audio data available");

      void 0;
      const reader = new FileReader();
      reader.addEventListener("loadend", function() {
        // reader.result contains the contents of blob as a typed array
        let bufferArray = reader.result;
        // From: https://stackoverflow.com/questions/9267899/arraybuffer-to-base64-encoded-string
        // For going backwards, use https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript and note comment about ie10
        let base64String = btoa([].reduce.call(new Uint8Array(bufferArray),function(p,c){return p+String.fromCharCode(c)},''));
        //console.log(base64String);
        audio.storeRecordedAudio(base64String);
        audio.audioStorageCallback();
      });
      reader.readAsArrayBuffer(e.data);

      const audioUrl = window.URL.createObjectURL(e.data);
      // This works so nice and simple. From: http://stackoverflow.com/questions/33755524/how-to-load-audio-completely-before-playing (first answer)
      const audioObj = new Audio (audioUrl);
      audioObj.load();

      // Set time of clip for scrubbing: 
      // http://stackoverflow.com/questions/9563887/setting-html5-audio-position

      audio.storeAudio(audioObj);
    },

  }
        
  return(audio);

});


define([
  './utils.js',
], function (utils) {
  const state = {
    init: () => {
      void 0;
      state.history = undefined;
      state.manifest = {};
      state.utils = utils;
      state.accessLevel = 'create'; // one of 'create' or 'view'. If 'create' then we can create new graffitis, otherwise we can only view them
      state.activity = 'idle'; // one of "recording", "playing", "idle"
      state.pointer = { x : 0, y: 0 };
      state.playbackTimeElapsed = 0;
      state.windowSize = state.getWindowSize();
      state.resetOnNextPlay = false;
      state.recordedAudioString = '';
      state.audioStorageCallback = undefined;
      state.frameArrays = ['view', 'selections', 'contents'];
      state.currentRecordingId = undefined;
      state.scrollTop = undefined;
      state.selectedCellId = undefined;
      state.mute = false;
      state.recordingCursorPosition = { x: -1000, y: -1000 };
      state.viewInfo = undefined;
      state.recordingCellInfo = {};
      state.storageInProcess = false;
      state.tipTimeout = undefined;
      state.movieRecordingStarted = false;
      state.cellsAffectedByActivity = {};
      state.garnishing = false;
      state.garnishStyle = 'highlight'; // one of: 'highlight' or 'line'
      state.lastGarnishInfo = { garnishing: false };
      state.cellStates = {
        contents: {},
        changedCells: {},
        selections: {}
      };

    },

    getManifest: () => {
      return state.manifest;
    },

    setManifest: (manifest) => {
      state.manifest = $.extend({}, manifest);
    },

    removeManifestEntry: (recordingCellId, recordingId) => {
      const recordings = state.getManifestRecordingsForCell(recordingCellId);
      if (recordings != undefined) {
        if (recordings.hasOwnProperty(recordingId)) {
          delete(recordings[recordingId]);
          return true;
        }
      }
      return false;
    },

    getManifestSingleRecording: (recordingCellId, recordingId) => {
      const recordings = state.getManifestRecordingsForCell(recordingCellId);
      if (recordings === undefined) {
        return undefined;
      }
      return recordings.hasOwnProperty(recordingId) ? recordings[recordingId] : undefined;
    },

    getManifestRecordingsForCell: (recordingCellId) => {
      return state.manifest.hasOwnProperty(recordingCellId) ? state.manifest[recordingCellId] : undefined;
    },

    setSingleManifestRecording: (recordingCellId, recordingId, recordingData) => {
      if (!state.manifest.hasOwnProperty(recordingCellId)) {
        state.manifest[recordingCellId] = {};
      }
      state.manifest[recordingCellId][recordingId] = recordingData;
    },

    getAccessLevel: () => {
      return state.accessLevel;
    },

    setAccessLevel: (level) => {
      state.accessLevel = level;
    },

    // Window proportion adjustments for when recording is played on a different sized window than what it was recorded on. Not used any more
    getWindowSize: () => {
      return { width: $(window).width(), height: $(window).height() }
    },

    setTipTimeout: (tipFunc, t) => {
      state.clearTipTimeout();
      state.tipTimeout = setTimeout(tipFunc, t);
    },

    clearTipTimeout: () => {
      if (state.tipTimeout !== undefined) {
        clearTimeout(state.tipTimeout);
        state.tipTimeout = undefined;
      }
    },

    saveSelectedCellId: (cellId) => {
      state.selectedCellId = cellId;
    },

    getSelectedCellId: () => {
      return state.selectedCellId;
    },

    getCurrentRecordingId: () => {
      return state.currentRecordingId;
    },

    setCurrentRecordingId: (recordingId) => {
      state.currentRecordingId = recordingId;
    },

    getMute: () => {
      return state.mute;
    },

    setMute: (muteState) => {
      state.mute = muteState;
    },

    getGarnishing: () => {
      return state.garnishing;
    },

    setGarnishing: (status) => {
      state.garnishing = status;
    },

    getLastGarnishInfo: () => {
      return state.lastGarnishInfo;
    },

    setLastGarnishInfo: (x, y, garnishing, garnishStyle, garnishCellId) => {
      state.lastGarnishInfo = {
        garnishing: garnishing,
        garnishStyle: garnishStyle,
        garnishCellId: garnishCellId,
        x: x,
        y: y
      }
    },

    getGarnishStyle: () => {
      return state.garnishStyle;
    },

    setGarnishStyle: (style) => {
      state.garnishStyle = style;
    },

    getLastRecordingCursorPosition: () => {
      return { x: state.recordingCursorPosition.x, y: state.recordingCursorPosition.y }
    },

    setLastRecordingCursorPosition: (pos) => {
      state.recordingCursorPosition = { x: pos.x, y: pos.y }
    },

    getPlaybackStartTime: () => {
      return state.playbackStartTime;
    },

    setPlaybackStartTime: (startTime) => {
      state.playbackStartTime = startTime;
    },

    getRecordingInterval: () => {
      return state.recordingInterval;
    },

    setRecordingInterval: (interval) => {
      state.recordingInterval = interval;
    },

    getPlaybackInterval: () => {
      return state.playbackInterval;
    },

    setPlaybackInterval: (interval) => {
      state.playbackInterval = interval;
    },

    getPlaybackTimeElapsed: () => {
      return state.playbackTimeElapsed;
    },

    setPlaybackTimeElapsed: (timeElapsed) => {
      if (timeElapsed === undefined) {
        state.playbackTimeElapsed = state.utils.getNow() - state.getPlaybackStartTime();
      } else {
        state.playbackTimeElapsed = timeElapsed;
      }
    },

    clearSetupForReset: () => {
      state.resetOnNextPlay = false;
    },

    setupForReset: () => {
      state.resetOnNextPlay = true;
    },

    // Set the index back to the beginning
    resetPlayState: () => {
      state.resetOnNextPlay = false;
      state.playbackTimeElapsed = 0;
    },

    getActivity: () => {
      return state.activity;
    },

    setActivity: (newState) => {
      state.activity = newState;
    },

    getPointerPosition: () => {
      return state.pointer;
    },

    storePointerPosition: (x,y) => {
      state.pointer = { x: x, y: y };
      //console.log('annotations.state.pointer:', annotations.state.pointer);
    },

    storeViewInfo: (viewInfo) => {
      // console.log('storeViewInfo, hover cellId:', viewInfo.cellId);
      if (viewInfo.cellId !== undefined) {
        state.viewInfo = $.extend({}, viewInfo);
      }
    },

    getRecordingCellInfo: () => {
      return state.recordingCellInfo;
    },

    storeRecordingCellInfo: (cellInfo) => {
      void 0;
      state.recordingCellInfo = cellInfo;
    },

    getMovieRecordingStarted: () => {
      return state.movieRecordingStarted;
    },

    setMovieRecordingStarted: (status) => {
      state.movieRecordingStarted = status;
    },

    getStorageInProcess: () => {
      return state.storageInProcess;
    },

    setStorageInProcess: (status) => {
      state.storageInProcess = status;
    },

    // In any history:
    //
    // Each entry in pointer[] is an object with:
    //   end time of this frame
    //   cursor position relative to active cell
    //   a hash of cell selections
    // Each entry in selection[] is an object with:
    //   end time of this frame
    //   currently active cell id
    //   a hash of all cell selections
    // Each entry in contents[] is an object with:
    //   end time of this frame
    //   hash of all cell contents by id

    dumpHistory: () => {
      void 0;
      void 0;
      void 0;
      void 0;
    },

    // Refresh cellIndexMap and cellIdMap before recording
    // or after loading recordings.
    refreshCellMaps: () => {
    },

    assignCellIds: () => {
      const cells = Jupyter.notebook.get_cells();
      let cell, cellId, iStr, i;
      state.cellIndexMap = {};
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        cellId = utils.generateUniqueId();
        if (!cell.metadata.hasOwnProperty('cellId')) {
          cell.metadata.cellId = cellId;
        }
        state.cellIndexMap[cellId] = i;
      }
    },

    createViewRecord: (opts) => {
      return $.extend({}, state.viewInfo, {
        dx: (state.pointer.x - state.viewInfo.innerCellRect.left)  / state.viewInfo.innerCellRect.width,
        dy: (state.pointer.y - state.viewInfo.innerCellRect.top)   / state.viewInfo.innerCellRect.height,
        pointerUpdate: opts.pointerUpdate,
        focusUpdate: opts.focusUpdate,
        selectedCellId: state.selectedCellId
      });
    },

    createSelectionsRecord: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      const cells = Jupyter.notebook.get_cells();
      const cellsSelections = {};
      let cellId, cm, cell, selections, cellSelections, executed, output, outputs0, ourJs;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        if (cell.cell_type === 'code') {
          cellId = cell.metadata.cellId;
          cm = cell.code_mirror;
          selections = utils.cleanSelectionRecords(cm.listSelections());
          executed = false;
          output = null;
          ourJs = false; 
          if (cell.output_area.outputs.length > 0) {
            outputs0 = cell.output_area.outputs[0];
            output_type = outputs0.output_type;
            void 0;
            if (output_type === 'display_data') {
              if (outputs0.data.hasOwnProperty('application/javascript')) {
                if (outputs0.data['application/javascript'].match(/Graffiti\sjavascript/g) !== null) {
                  ourJs = true;
                }
              }
            }
            if (!ourJs) {
              // Note that we filter out our own javascript outputs-- we don't want to rerun these when we restore cell states or 
              // else we could rerun the whole recording.
              void 0;
              output = { 
                header: { msg_type: output_type },
                content: outputs0
              };
              executed = true;
            }
          }
          cellSelections = {
            index: i,
            active: cellId === activeCell.metadata.cellId,
            selections: selections,
            executed: executed,
            output: output
          }
          cellsSelections[cellId] = cellSelections;
        }
      }

      return { cellsSelections: cellsSelections };
    },

    extractDataFromContentRecord: (record, cellId) => {
      if (record.backRef !== undefined) {
        if (record.backRefKind === 'contents') {
          return state.history.contents[record.backRef].cellsContent[cellId].contentsRecord.data;
        } else {
          return state.history.contents[record.backRef].cellsContent[cellId].outputsRecord.data;
        }
      }
      return record.data;
    },

    createBackRefRecord: (data, backRefKind, backRefArray, cellId) => {
      let backRef;
      let record = backRefArray[cellId];
      if (record !== undefined) {
        if ( (backRefKind === 'contents' && data === record.data) ||
             (backRefKind === 'outputs'  && _.isEqual(data, record.data)) ) {
          backRef = record.index;
          data = undefined;
        }
      }
      // Store as-yet-unseen contents or outputs for later backref. Delete the backRefKind value to avoid confusion.
      if (data !== undefined) {
        backRefKind = undefined;
        backRefArray[cellId] = {
          index: state.history.contents.length, // note that this is not the length - 1, because we are still contructing
          // this contents record and haven't pushed it onto the history yet.
          data: data
        }
      }
      return {
        data: data,
        backRef: backRef,
        backRefKind: backRefKind
      }
    },

    createContentsRecord: () => {
      const cells = Jupyter.notebook.get_cells();
      const cellsContent = {};
      let cellId, cell, contents, outputs, contentsBackRefRecord, outputsBackRefRecord;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        cellId = cell.metadata.cellId;
        contents = cell.get_text();
        outputs = (cell.cell_type === 'code' ? _.compact(cell.output_area.outputs) : undefined);
        contentsBackRefRecord = state.createBackRefRecord(contents, 'contents', state.history.cellContentsTracking, cellId);
        outputsBackRefRecord =  state.createBackRefRecord(outputs,  'outputs',  state.history.cellOutputsTracking,  cellId);
        // console.log('createContentsRecord, outputs:', outputs);
        let cellContent = {
          index: i,
          contentsRecord: contentsBackRefRecord,
          outputsRecord: outputsBackRefRecord
        }
        cellsContent[cellId] = cellContent;
      }

      return { cellsContent: cellsContent };
    },

    storeHistoryRecord: (type, time) => {
      if (state.getActivity() !== 'recording')
        return;

      let record;
      // Note: we override the type to throw together pointer moves, scroll innerScroll, and focus in one history record type
      switch (type) {
        case 'pointer':
          record = state.createViewRecord({ pointerUpdate: true,  focusUpdate: false });
          type = 'view';
          break;
        case 'scroll':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:false });
          type = 'view';
          break;
        case 'innerScroll':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:false });
          type = 'view';
          break;
        case 'focus':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:true });
          type = 'view';
          break;
        case 'selections':
          record = state.createSelectionsRecord();
          break;
        case 'contents':
          record = state.createContentsRecord();
          break;
      }
      record.startTime = (time !== undefined ? time : state.utils.getNow());
      state.history[type].push(record);
    },

    initHistory: (initialValues) => {
      const now = state.utils.getNow();
      state.history = {
        storageCellId: initialValues.storageCellId,
        recordingStartTime: now,

        // Time tracks: all pointer positions, cell selections and contents over the time of the recording.
        view:        [],                          // pointer move, vertical scroll or innerscroll (scroll inside cell)
        selections:  [],                          // cell selections
        contents:    [],                          // contents state: what cells present, and what their contents are, and cell outputs

        // Where we are in each track, during playback.
        lastVisited: {
          view: 0,
          selections: 0,
          contents: 0
        },

        cellContentsTracking: {},                  // this enables back-referencing to reduce storage costs on content recording
        cellOutputsTracking:  {},                  // this enables back-referencing to reduce storage costs on output recording
      }

      // Store initial state records at the start of recording.
      state.storeHistoryRecord('pointer',    now);
      state.storeHistoryRecord('scroll',     now);
      state.storeHistoryRecord('focus',      now);
      state.storeHistoryRecord('selections', now);
      state.storeHistoryRecord('contents',   now);
    },

    finalizeHistory: () => {
      void 0;
      delete(state.history.cellContentsTracking);
      delete(state.history.cellOutputsTracking);
      state.setActivity('idle');
      state.setHistoryDuration();
      state.normalizeTimeframes();
      state.setupForReset();
    },

    getJSONHistory: () => {
      return JSON.stringify(state.history);
    },

    getHistoryDuration: () => {
      return state.history.duration;
    },

    setHistoryDuration: () => {
      state.history.duration = state.utils.getNow() - state.history.recordingStartTime;
    },

    // When recording finishes, normalize all time frames
    normalizeTimeframes: () => {
      const recordingStartTime = state.history.recordingStartTime;
      const now = state.utils.getNow();
      for (let arrName of state.frameArrays) {
        let historyArray = state.history[arrName];
        let max = historyArray.length - 1;
        for (let i = 0; i < historyArray.length; ++i) {
          if ((historyArray.length === 1) || (i === max)) {
            historyArray[i].endTime = now;
          } else {
            historyArray[i].endTime = historyArray[i+1].startTime;
          }
          historyArray[i].endTime = historyArray[i].endTime - recordingStartTime;
          historyArray[i].startTime = historyArray[i].startTime - recordingStartTime;
        }
      }
    },

    // Get all history record frame types straddling a given time.
    getHistoryRecordsAtTime: (t) => {
      let indexes = {}, frame, historyArray, arrName, scanPtr, scanDir, currentFrameIndex, numRecords;
      for (arrName of state.frameArrays) {
        historyArray = state.history[arrName];
        numRecords = historyArray.length;
        currentFrameIndex = state.history.lastVisited[arrName];
        indexes[arrName] = null;
        if (historyArray.length > 0) {
          frame = historyArray[currentFrameIndex];
          if ((t >= frame.startTime) && (t < frame.endTime)) {
            // We're already in the right frame so just return that
            indexes[arrName] = currentFrameIndex;
          } else {
            // if the distance between the start time of the current frame and t is
            // < 10% of the total duration, start scanning up or
            // down from the current frame until you find the right frame.
            const tDist = t - frame.startTime;
            const tDistAbs = Math.abs(tDist);
            if ((tDistAbs / state.getHistoryDuration()) < 0.1) {
              scanDir = Math.sign(tDist);
              scanPtr = currentFrameIndex + scanDir;
            } else {
              // Scan to find the frame:
              //  from the beginning of the recording if the time is in the first half of the recording,
              //  otherwise scan backwards from the end
              if (t < state.getHistoryDuration() / 2) {
                scanPtr = 0;
                scanDir = 1;
              } else {
                scanPtr = numRecords - 1;
                scanDir = -1;
              }
            }
            while ((scanPtr >= 0) && (scanPtr < numRecords)) {
              frame = historyArray[scanPtr];
              if ((t >= frame.startTime) && (t < frame.endTime)) {
                indexes[arrName] = scanPtr;
                state.history.lastVisited[arrName] = scanPtr;
                break;
              }
              scanPtr += scanDir;
            }
          }
        }
      }
      return(indexes);
    },

    getHistoryItem: (kind, index) => {
      return state.history[kind][index];
    },

    storeWholeHistory: (history) => {
      state.history = $.extend({}, history);
      state.resetPlayState();
    },

    getTimeRecordedSoFar: () => {
      return state.utils.getNow() - state.history.recordingStartTime;
    },

    getTimePlayedSoFar: () => {
      return state.utils.getNow() - state.getPlaybackStartTime();
    },

    storeCellStates: () => {
      state.cellsAffectedByActivity = {};
      const cells = Jupyter.notebook.get_cells();
      let cellId;
      state.cellStates = {
        contents: {},
        changedCells: {},
        selections: state.createSelectionsRecord(),
      };
      for (let cell of cells) {
        if (cell.cell_type === 'code') {
          cellId = cell.metadata.cellId;
          state.cellStates.contents[cellId] = cell.get_text();
        }
      }
    },

    storeCellIdAffectedByActivity: (cellId) => {
      const activity = state.getActivity();
      if (activity !== 'playing' && activity !== 'recording')
        return;

      //console.log('storeCellIdAffectedByActivity, logging cell: ' + cellId);
      state.cellStates.changedCells[cellId] = true;
    },

    restoreCellStates: (which) => {
      const affectedIds = Object.keys(state.cellStates.changedCells);
      let selections;
      if (affectedIds.length > 0) {
        let cell, cellState;
        for (let id of affectedIds) {
          cell = utils.findCellByCellId(id);
          if (cell !== undefined) {
            selections = state.cellStates.selections.cellsSelections[id];
            if (which === 'contents') {
              if (state.cellStates.contents && state.cellStates.contents.hasOwnProperty(id)) { // making this more defensive
                cell.set_text(state.cellStates.contents[id]);
                cell.clear_output();
                if (selections.executed) {
                  cell.output_area.handle_output(selections.output);
                }
              }
            } else {
              if (selections.active) {
                cell.code_mirror.focus();
              }
              void 0;
              cell.code_mirror.setSelections(selections.selections);
            }
          }
        }
      }
    },

    getScrollTop: () => {
      return state.scrollTop;
    },

    setScrollTop: (scrollTop) => {
      state.scrollTop = scrollTop;
    },


  }

  return(state);

});

define([
  'base/js/dialog',
  './LZString.js',
  './state.js',
  './utils.js',
  './audio.js',
  './storage.js',
  'components/marked/lib/marked'
], function(dialog, LZString, state, utils, audio, storage, marked) {
  const Annotations = (function() {
    const annotations = {

      init: () => {
        void 0;
        utils.loadCss([
          'jupytergraffiti/css/font-awesome.min.css',
          'jupytergraffiti/css/annotations.css'
        ]);

        const location = document.location;
        state.recordingActive = ((!(location.hostname.match(/\.udacity-student-workspaces\.com/) != null)) ||
                                 (  location.hostname.match(/cocoview/) != null));

        state.init();
        audio.init(state);

        annotations.LZString = LZString;
        annotations.rewindAmt = 1; /*seconds */
        annotations.CMEvents = {};
        annotations.sitePanel = $('#site');
        annotations.notebookPanel = $('#notebook');
        annotations.notebookContainer = $('#notebook-container');

        annotations.storageInProcess = false;
        annotations.newScrollTop = 0;
        annotations.savedScrollTop = undefined;
        annotations.highlightMarkText = undefined;
        annotations.cmLineHeight = 17.0001; // line height of code mirror lines as styled in Jupyter
        annotations.cmLineFudge = 8; // buffer between lines
        annotations.tokenRanges = {};
        annotations.canvases = {};

        storage.loadManifest('author').then(() => {
          audio.setAudioStorageCallback(storage.storeMovie);
          annotations.addCMEvents();
          setTimeout(() => { 
            annotations.setupControls(); 
            annotations.setNotification('Graffiti is loaded and ready for use.', () => { annotations.clearNotification(); }, 3000);
          }, 500); // this timeout avoids too-early rendering of hidden recorder controls

          annotations.refreshAllAnnotationHighlights();
          annotations.refreshAnnotationTips();
        });
      },

      //i nspired by https://www.codicode.com/art/how_to_draw_on_a_html5_canvas_with_a_mouse.aspx
      // and : http://perfectionkills.com/exploring-canvas-drawing-techniques/

      placeCanvas: (cellId, canvasType) => {
        if (annotations.canvases[cellId] !== undefined) {
          //console.log('not adding ' + canvasType + ' canvas to this cell, already exists.');
          return;
        }
        const cell = utils.findCellByCellId(cellId);
        const cellElement = $(cell.element[0]);
        const canvasClass = 'recorder-canvas-' + canvasType;
        const existingCanvas = cellElement.find('.' + canvasClass);
        const cellRect = cellElement[0].getBoundingClientRect();
        $('<div class="recorder-canvas-outer"><canvas /></div>').appendTo(cellElement);
        const newCellCanvasDiv = cellElement.find('.recorder-canvas-outer:first');
        const newCellCanvas = newCellCanvasDiv.find('canvas')[0];
        const ctx =  newCellCanvas.getContext("2d");

        const canvasStyle = {
          width: cellRect.width + 'px',
          height: cellRect.height + 'px'
        };
        newCellCanvasDiv.css(canvasStyle);
        newCellCanvas.width = cellRect.width;
        newCellCanvas.height = cellRect.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        annotations.canvases[cellId] = {
          div: newCellCanvasDiv,
          canvas: newCellCanvas,
          ctx: ctx,
          cellRect: cellRect
        };
      },
      
      setCanvasStyle: (cellId, canvasType) => {
        const canvas = annotations.canvases[cellId];
        const ctx = canvas.ctx;
        if (canvasType === 'highlight') {
          ctx.strokeStyle = 'rgb(255,255,0)';
          ctx.shadowColor = 'rgb(255,255,0)';
          ctx.lineWidth = 15;
          ctx.shadowBlur = 35;
          ctx.globalAlpha = 0.5;
        } else { // lines are default although if erase activated, we will ignore this style and use clearRect
          ctx.strokeStyle = 'rgb(0,0,0)';
          ctx.shadowColor = 'rgb(0,0,0)';
          ctx.shadowBlur = 1;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 1.0;
        }
      },

      clearCanvas: (cellId) => {
        const canvas = annotations.canvases[cellId];
        const ctx = canvas.ctx;
        const cellRect = canvas.cellRect;
        ctx.clearRect(0, 0, cellRect.width, cellRect.height);
      },
      
      clearAllCanvases: () => {
        for (let cellId of Object.keys(annotations.canvases)) {
          annotations.clearCanvas(cellId);
        }
      },

      updateGarnishDisplay: (cellId, ax, ay, bx, by, garnishStyle) => {
        //console.log('updateGarnishDisplay');
        if (annotations.canvases.hasOwnProperty(cellId)) {
          const ctx = annotations.canvases[cellId].ctx;
          if (garnishStyle === 'erase') {
            const eraseBuffer = 25;
            ctx.clearRect(ax - eraseBuffer / 2, ay - eraseBuffer / 2, eraseBuffer, eraseBuffer);
          } else {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.closePath();
            ctx.stroke();
          }          
        }
      },

      updateGarnishDisplayIfRecording: (ax, ay, bx, by, viewInfo) => {
        if (state.getActivity() === 'recording') {
          const lastGarnishInfo = state.getLastGarnishInfo();
          if (viewInfo.garnishing) {
            annotations.placeCanvas(viewInfo.cellId, viewInfo.garnishStyle);
            annotations.setCanvasStyle(viewInfo.cellId, viewInfo.garnishStyle);
            const cellRect = viewInfo.cellRect;
            annotations.updateGarnishDisplay(viewInfo.cellId, 
                                             ax - cellRect.left,
                                             ay - cellRect.top, 
                                             bx - cellRect.left,
                                             by - cellRect.top,
                                             viewInfo.garnishStyle);
            state.setLastGarnishInfo(bx, by, viewInfo.garnishing, viewInfo.garnishStyle, viewInfo.cellId);
          } else {
            // finished garnishing so set this garnish to fade out, if it's a highlighting garnish. line garnishes don't fade
            if (lastGarnishInfo.garnishing) {
              state.setLastGarnishInfo(bx, by, viewInfo.garnishing, viewInfo.garnishStyle, viewInfo.cellId);
            }
          }
        }
      },

      // extract any tooltip commands
      extractTooltipCommands: (markdown) => {
        const commandParts = markdown.match(/^%%(([^\s]*)\s(.*))$/mg);
        let partsRecord;
        if (commandParts === null)
          return undefined;
        if (commandParts.length > 0) {
          partsRecord = {
            buttonName: undefined,
            captionPic: '',
            caption: ''
          };
          let parts;
          for (let i = 0; i < commandParts.length; ++i) {
            parts = commandParts[i].match(/^(\S+)\s(.*)/).slice(1);
            switch (parts[0].toLowerCase()) {
              case '%%button_name':
                partsRecord.buttonName = parts[1];
                break;
              case '%%caption_pic':
                partsRecord.captionPic = utils.renderMarkdown(parts[1]);
                break;
              case '%%caption':
                partsRecord.caption = parts[1];
                break;
            }
          }
        }
        return partsRecord;
      },

      // Refresh the markDoc calls for any particular cell based on recording data

      // ******************************************************************************************************************************************
      // we should store the ranges we get back for the recordings so we can tell if the cursor is in any of them on cursorActivity
      // ******************************************************************************************************************************************

      refreshAnnotationHighlights: (params) => {
        const recordings = state.getManifestRecordingsForCell(params.cell.metadata.cellId);
        const cm = params.cell.code_mirror;
        const marks = cm.getAllMarks();
        let markClasses;
        if (params.clear) {
          for (let mark of marks) {
            mark.clear();
          }
        } else {
          markClasses = marks.map((mark) => { return mark.className }).join(' ').replace(/annotation-highlight /g, '');
        }
        const allTokens = utils.collectCMTokens(cm);
        const cellId = params.cell.metadata.cellId;
        annotations.tokenRanges[cellId] = {};
        if (recordings !== undefined) {
          if (Object.keys(recordings).length > 0) {
            let keyParts,recording, recordingKey, tokens, firstToken, marker, range;
            for (recordingKey of Object.keys(recordings)) {
              recording = recordings[recordingKey];
              tokens = recording.tokens;
              //console.log('recordingKey:', recordingKey);
              range = utils.getCMTokenRange(cm, tokens, allTokens);
              if (range !== undefined) {
                // Store computed character ranges for checking selections against recording ranges.
                annotations.tokenRanges[cellId][recordingKey] = range;
                if (params.clear || (!params.clear && markClasses !== undefined && markClasses.indexOf(recordingKey) === -1)) {
                  // don't call markText twice on a previously marked range
                  marker = 'an-' + recording.cellId + '-' + recordingKey;
                  cm.markText({ line:range.start.line, ch:range.start.ch},
                              { line:range.end.line,   ch:range.end.ch  },
                              { className: 'annotation-highlight ' + marker });
                }
              }
            }
          }
        }
      },

      refreshAllAnnotationHighlights: () => {
        const cells = Jupyter.notebook.get_cells();
        for (let cell of cells) {
          annotations.refreshAnnotationHighlights({ cell: cell, clear: true });
        }
      },

      refreshAnnotationTips: () => {
        const tips = $('.annotation-highlight');
        //console.log('tips:', tips);
        //console.log('refreshAnnotationTips: binding mousenter/mouseleave');
        tips.unbind('mouseenter mouseleave').bind('mouseenter mouseleave', (e) => {
          const highlightElem = $(e.target);
          const idMatch = highlightElem.attr('class').match(/an-(id-.[^\-]+)-(id-[^\s]+)/);
          if (idMatch !== undefined) {
            const cellId = idMatch[1];
            const recordingId = idMatch[2];
            const hoverCell = utils.findCellByCellId(cellId);
            const hoverCellElement = hoverCell.element[0];
            const hoverCellElementPosition = $(hoverCellElement).position();
            const outerInputElement = $(hoverCellElement).find('.CodeMirror-lines');
            const recording = state.getManifestSingleRecording(cellId, recordingId);
            let existingTip = annotations.notebookContainer.find('.annotation-tip');
            if (e.type === 'mouseleave') {
              state.setTipTimeout(() => { existingTip.hide(); }, 500);
            } else {
              const currentPointerPosition = state.getPointerPosition();
              // Only show tip if cursor rests on hover for a 1/2 second
              state.setTipTimeout(() => {
                const newPointerPosition = state.getPointerPosition();
                const cursorDistanceSquared = (newPointerPosition.x - currentPointerPosition.x) * (newPointerPosition.x - currentPointerPosition.x) +
                                                 (newPointerPosition.y - currentPointerPosition.y) * (newPointerPosition.y - currentPointerPosition.y);

                //console.log('comparing currentPointerPosition, newPointerPosition:', currentPointerPosition,
                //            newPointerPosition, cursorDistanceSquared);
                if (cursorDistanceSquared > 2000) {
                  state.clearTipTimeout();
                } else {
                  // const markdown = marked("## Header 2\n### Header3\nSee more [**details of defining keyboard shortcuts**](http://google.com) " +
                  // "below.\n\n Let's go to [**Udacity**](https://udacity.com).");
                  let contentMarkdown = '';
                  //console.log('markId:', markId, 'recordings:', hoverCell.metadata.recordings);
                  const tooltipCommands = annotations.extractTooltipCommands(recording.markdown);
                  let headlineMarkdown = '';
                  if (tooltipCommands !== undefined) {
                    headlineMarkdown = '<div class="headline">' +
                                       ' <div>' + tooltipCommands.captionPic + '</div><div>' + tooltipCommands.caption + '</div>' +
                                       '</div>';
                  }
                  if (recording !== undefined) {
                    contentMarkdown = utils.renderMarkdown(recording.markdown)
                  }
                  let tooltipContents = headlineMarkdown + '<div class="parts">' + '<div class="info">' + contentMarkdown + '</div>';
                  if (recording.hasMovie) {
                    const buttonName = (((tooltipCommands !== undefined) && (tooltipCommands.buttonName !== undefined)) ? tooltipCommands.buttonName : 'Play Movie');
                    tooltipContents +=
                      '   <div class="movie"><button class="btn btn-default btn-small" id="moviePlay" cell-id="' + cellId + '" recording-id="' + recordingId + '">' +
                      buttonName + '</button></div>';
                  }
                  tooltipContents += '</div>';

                  if (existingTip.length === 0) {
                    existingTip = $('<div class="annotation-tip" id="annotation-tip">' + tooltipContents + '</div>')
                      .prependTo(annotations.notebookContainer);
                    existingTip.bind('mouseenter mouseleave', (e) => {
                      //console.log(e.type === 'mouseenter' ? 'entering tooltip' : 'leaving tooltip');
                      if (e.type === 'mouseenter') {
                        state.clearTipTimeout();
                      } else {
                        existingTip.hide();
                      }
                    });
                  } else {
                    existingTip.find('#moviePlay').unbind('click');
                    existingTip.html(tooltipContents);
                  }
                  existingTip.find('#moviePlay').click((e) => {
                    void 0;
                    state.clearTipTimeout();
                    existingTip.hide();
                    e.stopPropagation(); // for reasons unknown even still propogates to the codemirror editing area undeneath
                    const button = $(e.target);
                    const tipCellId = button.attr('cell-id');
                    const tipRecordingId = button.attr('recording-id');
                    const activity = state.getActivity();
                    annotations.loadAndPlayMovie(tipCellId, tipRecordingId);
                    return false;
                  });
                  const outerInputOffset = outerInputElement.offset();
                  const highlightElemOffset = highlightElem.offset();
                  const existingTipHeight = existingTip.height();
                  const tipLeft = parseInt(Math.min(outerInputElement.width() - existingTip.width(),
                                                    Math.max(highlightElemOffset.left, outerInputOffset.left)));
                  const tipPosition = { left: tipLeft,
                                        top: parseInt(highlightElemOffset.top - outerInputOffset.top) - existingTipHeight - 20 };
                  //console.log('outerInputOffset:', outerInputOffset, 'highlightElemOffset:', highlightElemOffset, 'tipPosition:', tipPosition);
                  //console.log('tipPosition.top:', tipPosition.top);
                  const highlightElemRect = highlightElem[0].getBoundingClientRect();
                  const headerRect = $('#header')[0].getBoundingClientRect();
                  // if the highlight element is in the upper half of the notebook panel area. flip the tooltip to be below the highlightElem
                  const rectDifference = highlightElemRect.top - headerRect.bottom - 20;
                  if (rectDifference < existingTipHeight ) {
                    tipPosition.top = highlightElemOffset.top - outerInputOffset.top + annotations.cmLineHeight + annotations.cmLineFudge;
                  }
                  tipPosition.top += hoverCellElementPosition.top;
                  const positionPx = { left: tipPosition.left + 'px', top: tipPosition.top + 'px' };
                  existingTip.css(positionPx);
                  existingTip.show();
                }
              }, 425); // this number is how long user has to hover before we display the tooltip
            }
          }
        });
      },

      updateTimeDisplay: (playedSoFar) => {
        const timeDisplay = utils.formatTime(playedSoFar);
        const recorderTimeDisplay = $('.recorder-time-display:first');
        recorderTimeDisplay.text(timeDisplay);
        /*
           // Update recording flasher icon
           const now = utils.getNow();
           if (now % 1000 < 500) {
           $('#recorder-flasher').hide();
           } else {
           $('#recorder-flasher').show();
           }
         */
      },

      setupBackgroundEvents: () => {
        // Handle rubber banding scrolling that occurs on short notebooks so cursor doesn't look wrong (possibly, only chrome?).
        void 0;

        annotations.sitePanel.on('scroll', (e) => {
          const notebookPanelHeight = annotations.notebookPanel.height();
          const viewInfo = utils.collectViewInfo(state.getPointerPosition().y,
                                                 annotations.notebookPanel.height(),
                                                 annotations.sitePanel.scrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('scroll');
          return true;
        });

        $('body').keydown((e) => {
          const activity = state.getActivity();
          let stopProp = false;
          //console.log('keydown e:', e);
          switch (e.which) {
            case 32: // space key stops playback
              if (activity === 'playing') {
                stopProp = true;
                annotations.togglePlayBack();
              }
              break;
            case 27: // escape key stops playback, cancels pendingRecording, and completes regular recording in process
              stopProp = true;
              switch (activity) {
                case 'recording':
                  annotations.toggleRecording();
                  annotations.updateControlsDisplay();
                  break;
                case 'recordingPending':
                  annotations.clearPendingRecording();
                  break;
                case 'playing':
                case 'playbackPaused':
                  annotations.cancelPlayback();
                  break;
              }
              break;
            case 13:
              if (e.altKey) {
                void 0;
                annotations.finishAnnotation(true);
                stopProp = true;
              }
              break;
            case 18:
              if (activity === 'recording') {
                void 0;
                state.setGarnishing(true);
                (e.metaKey) ? state.setGarnishStyle('erase') : state.setGarnishStyle('highlight');
                stopProp = true;
              }
              break;
            case 91:
              if (activity === 'recording') {
                void 0;
                state.setGarnishing(true);
                (e.altKey) ? state.setGarnishStyle('erase') : state.setGarnishStyle('line');
                stopProp = true;
              }
              break;
            default:
              break; // let other keys pass through
          }
            
          if (stopProp) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }

          return true;
        });

        $('body').keyup( (e) => {
          // any keyup turns off garnishing
          state.setGarnishing(false);
        });

        annotations.sitePanel.on('click', (e) => {
          //console.log('notebook panel click event:',e);
          const target = $(e.target);
          //annotations.handleControlsClick(target);
          return true;
        });

        window.onmousemove = (e) => {
          //console.log('cursorPosition:[',e.clientX, e.clientY, ']');
          //console.log('mouse_e:', e.pageX, e.pageY);
          const previousPointerPosition = state.getPointerPosition();
          const previousPointerX = previousPointerPosition.x;
          const previousPointerY = previousPointerPosition.y;
          state.storePointerPosition( e.clientX, e.clientY ); // keep track of current pointer position at all times
          const viewInfo = utils.collectViewInfo(e.clientY, 
                                                 annotations.notebookPanel.height(), 
                                                 annotations.sitePanel.scrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('pointer');
          annotations.updateGarnishDisplayIfRecording(previousPointerX, previousPointerY, e.clientX, e.clientY, viewInfo );
          return true;
        };

        // if we were playing a recording when they hit reload, we need to cancel it, restore, and save before we continue
        window.onbeforeunload = (e) => {
          annotations.cancelPlaybackNoVisualUpdates();
        };

        void 0;
      },

      setupControls: () => {
        const lastButton = $('.btn-group:last');
        const panel = $('<div id="recorder-controls"></div>');
        panel.appendTo(lastButton);
        let recordHtml = '';
        if (state.recordingActive) {
          recordHtml +=
            '<div id="recorder-record-controls">' +
            '  <div id="recorder-record-controls-inner">' +
            '    <button class="btn btn-default" id="btn-edit-annotation"><i class="fa fa-pencil"></i>&nbsp; <span>Edit</span></button>' +
            '    <button class="btn btn-default" id="btn-finish-annotation" title="Save Annotation"><i class="fa fa-pencil"></i>' +
            '&nbsp;<span>Save Annotation</span></button>' +
            '    <a href="#" class="cancel" title="Cancel">Cancel changes</a>' +
            '    <div class="recorder-time-display-recording"></div>' +
            '    <button class="btn btn-default" id="btn-start-recording" title="Record movie for this annotation">' +
            '<i class="fa fa-film recorder-button"></i>&nbsp;<span>Record</span></button>' +
            '    <button class="btn btn-default recorder-hidden" id="btn-finish-recording" title="finish recording"><i class="fa fa-pause recorder-stop-button"></i>' +
            '&nbsp;Finish</button>' +
            '    <button class="btn btn-default" id="btn-remove-annotation" title="Remove Annotation"><i class="fa fa-trash"></i></button>' +
            '    <div class="recorder-hint">&nbsp;</div>' +
            '    <div id="recorder-api-key">&nbsp;</div>' +
            '  </div>' +
            '</div>';
        }
        recordHtml +=
          '<div id="recorder-playback-controls">' +
          '  <div id="recorder-playback-inner">' +
          '    <div class="recorder-playback-buttons">' +
          '      <button class="btn btn-default btn-play" id="btn-play" title="start playback">' +
          '        <i class="fa fa-play"></i>' +
          '      </button>' +
          '      <button class="btn btn-default recorder-hidden" id="btn-stop-play" title="stop playback">' +
          '        <i class="fa fa-pause"></i>' +
          '      </button>' +
          '    </div>' +
          '    <div class="recorder-range">' +
          '      <input title="scrub" type="range" min="0" max="1000" value="0" id="recorder-range"></input>' +
          '    </div>' +
          '    <div class="recorder-time-display"></div>' +
          '    <div class="recorder-skip-buttons">' +
          '      <button class="btn btn-default btn-rewind" id="btn-rewind" title="go back ' + annotations.rewindAmt + ' second">' +
          '        <i class="fa fa-backward"></i>' +
          '      </button>' +
          '      <button class="btn btn-default btn-forward" id="btn-forward" title="jump forward ' + annotations.rewindAmt + ' second">' +
          '        <i class="fa fa-forward"></i>' +
          '      </button>' +
          '      <button class="btn btn-default btn-sound-on" id="btn-sound-on" title="mute">' +
          '        <i class="fa fa-volume-up"></i>' +
          '      </button>' +
          '      <button class="btn btn-default btn-sound-off recorder-hidden" id="btn-sound-off" title="unmute">' +
          '        <i class="fa fa-volume-off"></i>' +
          '      </button>' +
          '      <div class="cancel" title="Cancel Playback"><span>Pause</span> to interact at any time, or <span>Cancel playback</span></div>' +
          '    </div>' +
          '  </div>' +
          '  <i id="recorder-cursor" name="cursor" class="recorder-cursor"><img src="jupytergraffiti/css/transparent_bullseye2.png"></i>' +
          '</div>' +
          '<div id="recorder-notifier"></div>';
        //'  <i id="recorder-cursor" name="cursor" class="fa fa-mouse-pointer recorder-cursor">&nbsp;</i>' +

        $('#recorder-controls').html(recordHtml);

        $('#recorder-range').on('mousedown', (e) => {
          //console.log('slider:mousedown');
          annotations.stopPlayback(); // stop playback if playing when you start to scrub
          annotations.clearAllCanvases();
          state.setActivity('scrubbing');
        });
        $('#recorder-range').on('mouseup', (e) => {
          //console.log('slider:mouseup')
          state.setActivity('playbackPaused');
          annotations.updateAllAnnotationDisplays();
        });

        $('#recorder-range').on('input', annotations.handleSliderDrag);
        annotations.recordingCursor = $('#recorder-cursor');

        $('#btn-start-recording').click((e) => { annotations.beginMovieRecordingProcess(); });
        $('#btn-finish-recording').click((e) => { annotations.toggleRecording(); });
        $('#btn-edit-annotation').click((e) => { annotations.editAnnotation('annotating'); });
        $('#btn-finish-annotation').click((e) => { annotations.finishAnnotation(true); });
        $('#btn-remove-annotation').click((e) => { annotations.removeAnnotationPrompt(); });
        $('#recorder-record-controls .cancel').click((e) => { annotations.finishAnnotation(false); });
        $('#recorder-playback-controls .cancel span:first').click((e) => { annotations.stopPlayback(); });
        $('#recorder-playback-controls .cancel span:last').click((e) => { annotations.cancelPlayback(); });
        $('#recorder-api-key').click((e) => { $('#recorder-api-key input').select(); });

        $('#btn-play, #btn-stop-play').click((e) => { annotations.togglePlayBack(); });
        $('#btn-forward,#btn-rewind').click((e) => {
          // console.log('btn-forward/btn-rewind clicked');
          let direction = 1;
          if (($(e.target).attr('id') === 'btn-rewind') || ($(e.target).hasClass('fa-backward'))) {
            direction = -1;
          }
          annotations.stopPlayback();
          const timeElapsed = state.getPlaybackTimeElapsed();
          const t = Math.max(0, Math.min(timeElapsed + (annotations.rewindAmt * 1000 * direction), state.getHistoryDuration() - 1 ));
          void 0;
          const frameIndexes = state.getHistoryRecordsAtTime(t);
          state.clearSetupForReset();
          state.setPlaybackTimeElapsed(t);
          annotations.updateDisplay(frameIndexes);
          annotations.updateSlider(t);
          annotations.updateAllAnnotationDisplays();
        });

        $('#btn-sound-on, #btn-sound-off').on('click', (e) => {
          void 0
          if (state.getMute()) {
            state.setMute(false);
            $('#btn-sound-off').hide();
            $('#btn-sound-on').show();
            if (state.getActivity() === 'playing') {
              audio.startPlayback(state.getTimePlayedSoFar());
            }
          } else {
            state.setMute(true);
            $('#btn-sound-on').hide();
            $('#btn-sound-off').show();
            if (state.getActivity() === 'playing') {
              audio.stopPlayback();
            }
          }
        });

        void 0;

        annotations.setupBackgroundEvents();
      },

      storeRecordingInfoInCell: () => {
        let recordingRecord, newRecording, recordingCell, recordingCellId, recordingKey;
        if (annotations.selectedTokens.isIntersecting) { 
          // Prepare to update existing recording
          recordingCell = annotations.selectedTokens.recordingCell;
          recordingCellId = annotations.selectedTokens.recordingCellId;
          recordingKey = annotations.selectedTokens.recordingKey;
          recordingRecord = state.getManifestSingleRecording(recordingCellId, recordingKey);
          newRecording = false;
        } else { 
          // Prepare to create a new recording
          recordingCell = Jupyter.notebook.get_selected_cell();
          recordingCellId = recordingCell.metadata.cellId;
          recordingKey = utils.generateUniqueId();
          newRecording = true;
          recordingRecord = {
            cellId: recordingCellId,
            createDate: utils.getNow(),
            inProgress: true,
            tokens: $.extend({}, annotations.selectedTokens.tokens),
            markdown: '',
            author: 'author',
            hasMovie: false
          }
          // Store recording info in the manifest
          state.setSingleManifestRecording(recordingCellId, recordingKey, recordingRecord);
        }

        state.storeRecordingCellInfo({
          newRecording: newRecording,
          recordingRecord: recordingRecord,
          recordingCell: recordingCell,
          recordingCellId: recordingCellId,
          recordingKey: recordingKey,
          scrollTop: annotations.sitePanel.scrollTop()
        });

        return recordingCell;
      },

      highlightIntersectingAnnotationRange: () => {
        const cell = annotations.selectedTokens.recordingCell;
        const cm = cell.code_mirror;
        const startLoc = cm.posFromIndex(annotations.selectedTokens.start);
        const endLoc = cm.posFromIndex(annotations.selectedTokens.end);
        annotations.highlightMarkText = cm.markText(startLoc, endLoc, { className: 'annotation-selected' });
      },

      editAnnotation: (newState) => {
        state.setActivity(newState);
        annotations.updateControlsDisplay();
        annotations.storeRecordingInfoInCell();

        const activeCellIndex = Jupyter.notebook.get_selected_index();
        const annotationEditCell = Jupyter.notebook.insert_cell_above('markdown');

        annotationEditCell.metadata.cellId = utils.generateUniqueId();
        let editableText = '';
        let finishLabel = 'Save Annotation';
        let finishIconClass = 'fa-pencil';
        $('#btn-finish-annotation i').removeClass('fa-film, fa-pencil');
        if (annotations.selectedTokens.isIntersecting) {
          editableText = annotations.selectedTokens.markdown; // use whatever author put into this annotation previously
          if (state.getActivity() === 'recordingLabelling') {
            finishLabel = 'Start Movie Recording';
            finishIconClass = 'fa-film';
          }
        } else {
          if (state.getActivity() === 'recordingLabelling') {
            finishLabel = 'Start Movie Recording';
            finishIconClass = 'fa-film';
            editableText = 'Enter any markdown to describe your movie, then click "Start Movie Recording", above.' + "\n";
          } else {
            editableText = 'Enter your markdown for the annotation here and then click "Save Annotation" above.' + "\n";
            // Add whatever tokens are selected for initial annotation
          }
          editableText += annotations.selectedTokens.tokens.allTokensString;
        }
        $('#btn-finish-annotation i').addClass(finishIconClass);
        $('#btn-finish-annotation span').text(finishLabel);

        annotationEditCell.set_text(editableText);
        annotationEditCell.unrender();
        Jupyter.notebook.scroll_to_cell(Math.max(0,activeCellIndex),500);
        const selectedCell = Jupyter.notebook.get_selected_cell();
        selectedCell.unselect();
        annotationEditCell.select();
        annotationEditCell.code_mirror.focus();
        annotationEditCell.code_mirror.execCommand('selectAll');

        annotations.annotationEditCellId = annotationEditCell.metadata.cellId;

        annotations.setRecorderHint('Alt- or Option-Enter to save your entry.');

      },

      finishAnnotation: (doSave) => {
        const activity = state.getActivity();
        if (activity !== 'annotating' && activity !== 'recordingLabelling')
          return;

        const recordingCellInfo = state.getRecordingCellInfo();
        const recordingCell = recordingCellInfo.recordingCell;

        $('#recorder-record-controls').hide();
        $('#btn-record').show();
        $('#btn-edit-annotation').show();
        $('#btn-finish-annotation').hide();
        $('#btn-remove-annotation').hide();
        $('#recorder-record-controls .cancel').hide();

        const editCellIndex = utils.findCellIndexByCellId(annotations.annotationEditCellId);

        let editCellContents = '';
        if (editCellIndex !== undefined) {
          const editCell = utils.findCellByCellId(annotations.annotationEditCellId);
          editCellContents = editCell.get_text();
          Jupyter.notebook.delete_cell(editCellIndex);

          // Save the annotation text into the right cell recording.
          const recordings = state.getManifestRecordingsForCell(recordingCellInfo.recordingCellId);
          if (doSave) {
            if (recordingCellInfo.newRecording) {
              recordings[recordingCellInfo.recordingKey] = recordingCellInfo.recordingRecord;
            }
            recordings[recordingCellInfo.recordingKey].markdown = editCellContents;
          }
        }
        storage.storeManifest('author');
        utils.saveNotebook();

        // need to reselect annotation text that was selected in case it somehow got unselected
        //recordingCell.code_mirror.setSelections(recordingCellInfo.selections);
        annotations.sitePanel.animate({ scrollTop: recordingCellInfo.scrollTop}, 500);
        if (doSave && state.getActivity() === 'recordingLabelling') {
          annotations.setPendingRecording();
        } else {
          state.setActivity('idle');
          recordingCell.code_mirror.focus();
          annotations.clearRecorderHint();
          annotations.refreshAnnotationHighlights({cell: recordingCell, clear: false});
          annotations.refreshAnnotationTips();
        }
        annotations.updateControlsDisplay();
      },

      removeAnnotationCore: (recordingCell, recordingKey) => {
        const recordingCellId = recordingCell.metadata.cellId;
        storage.deleteMovie(recordingCellId, recordingKey);
      },


      removeAllAnnotations: () => {
        const manifest = state.getManifest(); // save manifest before we wipe it out
        state.setManifest({});
        let recordingCellId, recordingCell, recordingIds, recordingKeys, destructions = 0;
        for (recordingCellId of Object.keys(manifest)) {
          void 0;
          recordingKeys = Object.keys(manifest[recordingCellId]);
          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            for (recordingKey of recordingKeys) {
              void 0;
              destructions++;
              annotations.removeAnnotationCore(recordingCell, recordingKey);
              annotations.refreshAnnotationHighlights({cell: recordingCell, clear: true});
            }
          }
        }
        storage.storeManifest('author');
        if (annotations.highlightMarkText !== undefined) {
          annotations.highlightMarkText.clear();
        }
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();
        utils.saveNotebook();

        dialog.modal({
          title: 'Your notebook is now cleaned of all graffiti.',
          body: 'We removed ' + destructions + ' graffitis. Feel free to create new ones.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                void 0;
              }
            }
          }
        });

      },

      removeAnnotation: (recordingCell, recordingKey) => {
        annotations.removeAnnotationCore(recordingCell, recordingKey);
        if (state.removeManifestEntry(recordingCell.metadata.cellId, recordingKey)) {
          if (annotations.highlightMarkText !== undefined) {
            annotations.highlightMarkText.clear();
          }
          annotations.refreshAnnotationHighlights({cell: recordingCell, clear: true});
          annotations.refreshAnnotationTips();
          annotations.updateControlsDisplay();
          storage.storeManifest('author');
          utils.saveNotebook();
        }
      },

      removeAllAnnotationsPrompt: () => {
        dialog.modal({
          title: 'Are you sure you want to remove ALL annotations from this notebook?',
          body: 'Note: this cannot be undone.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                void 0;
                annotations.removeAllAnnotations();

              }
            },
            'Cancel': { click: (e) => { void 0; } },
          }
        });

      },

      removeAnnotationPrompt: () => {
        if (annotations.selectedTokens.isIntersecting) {
          const recordingCell = annotations.selectedTokens.recordingCell;
          const recordingCellId = recordingCell.metadata.cellId;
          const recordingKey = annotations.selectedTokens.recordingKey;
          const recording = state.getManifestSingleRecording(recordingCellId,recordingKey);
          const content = '<b>Annotated string:</b>&nbsp;<i>' + recording.tokens.allTokensString + '</i><br/>' +
                          '<b>Annotation:</b>' + utils.renderMarkdown(recording.markdown) + '<br/><br/>' +
                          '(Note: this cannot be undone.)<br/>';
          dialog.modal({
            title: 'Are you sure you want to remove this annotation?',
            body: content,
            sanitize:false,
            buttons: {
              'OK': {
                click: (e) => {
                  void 0;
                  annotations.removeAnnotation(recordingCell, recordingKey);

                }
              },
              'Cancel': { click: (e) => { void 0; } },
            }
          });
        }
      },

      updateControlsDisplay: (cm) => {
        let activeCell;
        if (cm !== undefined) {
          activeCell = utils.findCellByCodeMirror(cm);
        } else {
          activeCell = Jupyter.notebook.get_selected_cell();
        }
        //console.log('updateControlsDisplay, activity:', state.getActivity());
        const cellId = activeCell.metadata.cellId;
        const activity = state.getActivity();
        switch (activity) {
          case 'recordingLabelling':
            $('#recorder-record-controls,#btn-finish-annotation,#recorder-record-controls .cancel').show();
            $('#btn-start-recording,#btn-edit-annotation,#btn-remove-annotation,#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'recordingPending':
            $('#recorder-record-controls').show();
            $('#btn-start-recording,#btn-finish-recording,#btn-edit-annotation,#btn-finish-annotation,#recorder-record-controls .cancel,' +
              '#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'recording':
            $('#recorder-record-controls,#recorder-record-controls .recorder-time-display-recording:first,#btn-finish-recording').show();
            $('#btn-start-recording,#btn-edit-annotation,#btn-finish-annotation,#btn-finish-annotation,#recorder-record-controls .cancel,' + 
              '#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'playing':
            $('#recorder-record-controls, #btn-play').hide();
            $('#recorder-playback-controls, #recorder-playback-controls .recorder-time-display:first, #btn-stop-play').show();
            break;
          case 'playbackPaused':
            $('#recorder-record-controls, #btn-stop-play').hide();
            $('#recorder-playback-controls, #btn-play').show();
            break;
          case 'annotating':
            $('#recorder-record-controls,#btn-finish-annotation,#recorder-record-controls .cancel').show();
            $('#btn-start-recording,#btn-edit-annotation,#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'idle':
            $('#recorder-record-controls,#btn-start-recording,#btn-edit-annotation, #recorder-record-controls #recorder-api-key').show();
            $('#btn-finish-recording, #btn-finish-annotation,#recorder-record-controls .recorder-time-display-recording:first').hide();
            $('#recorder-record-controls .cancel, #recorder-playback-controls').hide();
            // Check if anchor or head of current selection is inside an existing recording token set. Controls will be different if so.
            let rangeKey, range;
            let annotationBtnText = 'Create';
            let recordBtnText = 'Record';
            $('#btn-edit-annotation').attr({title:'Create Annotation'});
            if (annotations.highlightMarkText) {
              annotations.highlightMarkText.clear();
            }
            annotations.editableAnnotation = undefined;
            annotations.selectedTokens = utils.findSelectionTokens(activeCell, annotations.tokenRanges, state);
            $('#recorder-record-controls #recorder-api-key').hide();
            if (annotations.selectedTokens.noTokensPresent || state.getAccessLevel() === 'view') {
              $('#recorder-record-controls').hide();
            } else {
              if (annotations.selectedTokens.isIntersecting) {
                annotationBtnText = 'Edit';
                $('#btn-edit-annotation').attr({title:'Edit Annotation'});
                $('#btn-remove-annotation').show();
                annotations.highlightIntersectingAnnotationRange();
                //console.log('selectedTokens:', annotations.selectedTokens);
                if (annotations.selectedTokens.hasMovie) {
                  //console.log('this recording has a movie');
                  recordBtnText = 'Re-record';
                  $('#btn-start-recording').attr({title:'Re-record Movie'})
                  $('#recorder-record-controls #recorder-api-key').html('Movie api key:<span><input type="text" value="' + 
                                                                        annotations.selectedTokens.recordingCellId + '_' + 
                                                                        annotations.selectedTokens.recordingKey + '" /></span>');
                  $('#recorder-record-controls #recorder-api-key').show();
                } else {
                  recordBtnText = 'Record';
                  $('#btn-start-recording').attr({title:'Record Movie'})
                }
              }
            }
            $('#btn-edit-annotation span').text(annotationBtnText);
            $('#btn-start-recording span').text(recordBtnText);
            break;
        }
      },

      updateAllAnnotationDisplays: () => {
        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();
      },

      clearNotification: (force) => {
        const notifier = $('#recorder-notifier');
        if (force) {
          notifier.hide();
        } else {
          notifier.fadeOut(1500);
        }
      },

      setNotification: (notification, cb, timeout) => {
        const notifier = $('#recorder-notifier');
        notifier.html(notification).show();
        if (cb !== undefined) {
          setTimeout(cb, timeout);
        }
      },

      //
      // Recording control functions
      //

      setRecorderHint: (hint, cb) => {
        const recorderHintDisplay = $('.recorder-hint:first');
        recorderHintDisplay.html(hint).show();
        if (cb !== undefined) {
          recorderHintDisplay.find('span').bind('click', cb);
        }
      },

      clearRecorderHint: () => {
        const recorderHintDisplay = $('.recorder-hint:first');
        recorderHintDisplay.find('span').unbind('click');
        recorderHintDisplay.hide();
      },

      setPendingRecording: () => {
        if (state.getActivity() === 'recording') {
          annotations.toggleRecording(); // stop current recording
          annotations.updateControlsDisplay();
        } else {
          void 0;
          annotations.setRecorderHint('Click anywhere to begin recording movie. (ESC to cancel)');
          state.setActivity('recordingPending');
          annotations.updateControlsDisplay();
          state.restoreCellStates('selections'); // reset selections to when you clicked to begin the recording
        }
      },

      clearPendingRecording: () => {
        annotations.clearRecorderHint();
        state.setActivity('idle');
      },

      beginMovieRecordingProcess: () => {
        // Preserve the state of all cells and selections before we begin recording so we can restore when the recording is done.
        state.storeCellStates();
        annotations.editAnnotation('recordingLabelling');
      },

      addCMEventsToSingleCell: (cell) => {
        annotations.CMEvents[cell.metadata.cellId] = true;
        const cm = cell.code_mirror;
        cm.on('focus', (cm, e) => {
          //console.log('CM focus:' , cm, e);
          // Check to see if we jumped from another cell to this cell with the arrow keys. If we did and we're recording, we need to
          // create a focus history record because jupyter is not firing the select cell event in those cases.
          if (state.getActivity() === 'recording') {
            if (cell.metadata.cellId !== state.getSelectedCellId()) {
              state.saveSelectedCellId(cell.metadata.cellId);
              state.storeHistoryRecord('focus');
            }
          }
          if (state.getActivity() === 'recordingPending') {
            void 0;
            annotations.toggleRecording();
          }
          annotations.updateControlsDisplay();
        });

        cm.on('cursorActivity', (cm, e) => {
          //console.log('cursorActivity');
          annotations.updateControlsDisplay(cm);
          //console.log('annotations.selectedTokens:', annotations.selectedTokens);
          const affectedCell = utils.findCellByCodeMirror(cm);
          state.storeCellIdAffectedByActivity(affectedCell.metadata.cellId);
          state.storeHistoryRecord('selections');
        });

        cm.on('change', (cm, changeObj) => {
          //console.log('change activity:', changeObj);
          const affectedCell = utils.findCellByCodeMirror(cm);
          state.storeCellIdAffectedByActivity(affectedCell.metadata.cellId);
          state.storeHistoryRecord('contents');
          if (state.getActivity() === 'idle') {
            annotations.refreshAnnotationHighlights({cell: affectedCell, clear: true});
          }
        });

        cm.on('mousedown', (cm, e) => {
          //console.log('mousedown, e:', e);
          annotations.clearNotification(true); // immediately clear notification if present
        });

        cm.on('refresh', (cm, e) => {
          //console.log('**** CM refresh event ****');
        });

        cm.on('update', (cm, e) => {
          //console.log('**** CM update event ****');
          annotations.refreshAnnotationTips();
        });

        cm.on('scroll', (cm, e) => {
          const pointerPosition = state.getPointerPosition();
          const viewInfo = utils.collectViewInfo(pointerPosition.y, 
                                                 annotations.notebookPanel.height(), 
                                                 annotations.sitePanel.scrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('innerScroll');
        });

      },

      addCMEventsToCells: () => {
        const inputCells = Jupyter.notebook.get_cells();
        for (let cell of inputCells) {
          // Don't rebind if already bound
          if (!annotations.CMEvents.hasOwnProperty(cell.metadata.cellId)) {
            annotations.addCMEventsToSingleCell(cell);
          }
        }
      },

      // Bind all select, create, delete, execute  cell events at the notebook level
      addCMEvents: () => {
        annotations.addCMEventsToCells();

        Jupyter.notebook.events.on('select.Cell', (e, cell) => {
          //console.log('cell select event fired, e, cell:',e, cell.cell);
          //console.log('select cell store selections');
          state.storeHistoryRecord('focus');
          annotations.refreshAnnotationTips();
        });

        Jupyter.notebook.events.on('create.Cell', (e, results) => {
          //console.log('create.Cell fired');
          //console.log(results);
          const newCell = results.cell;
          const newCellIndex = results.index;
          newCell.metadata.cellId = utils.generateUniqueId();
          annotations.addCMEventsToSingleCell(newCell);
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('delete.Cell', (e) => {
          annotations.stopPlayback();
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('finished_execute.CodeCell', (e, results) => {
          void 0;
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('shell_reply.Kernel', (e, results) => {
          void 0;
          if (state.getStorageInProcess()) {
            storage.clearStorageInProcess();
            annotations.updateAllAnnotationDisplays();
          }
        });

      },


      toggleRecording: () => {
        const currentActivity = state.getActivity();
        if (currentActivity !== 'playing') {
          if (currentActivity === 'recording') {

            //
            // Stop movie recording currently underway.
            //

            annotations.clearAllCanvases();
            state.finalizeHistory();
            state.dumpHistory();
            clearInterval(state.getRecordingInterval());
            // This will use the callback defined in setAudioStorageCallback to actually persist everything.
            audio.stopRecording();
            $('#recorder-range').removeAttr('disabled');
            annotations.setRecorderHint('Movie saved. Now you can <span>play this movie</span>.', annotations.startPlayback);
            state.setActivity('idle');
            void 0;
            state.restoreCellStates('contents');
            annotations.updateAllAnnotationDisplays();
            annotations.sitePanel.animate({ scrollTop: state.getScrollTop() }, 750);
            state.restoreCellStates('selections');
            void 0;
          } else {

            //
            // Start new movie recording.
            //

            const recordingCellInfo = state.getRecordingCellInfo();
            if (recordingCellInfo == undefined) {
              // Error condition, cannot start recording without an active cell
              void 0;
              return;
            }
            void 0;

            state.setActivity('recording');
            state.setMovieRecordingStarted(true);
            state.assignCellIds();
            state.initHistory({
              storageCellId: recordingCellInfo.recordingCellId,
            });

            audio.startRecording();
            $('#recorder-range').attr('disabled',1);
            annotations.setRecorderHint('ESC: complete recording. Alt: draw lines. Option: draw highlights. Both:Erase.');
//            state.storeHistoryRecord('selections'); // is this necessary?
            state.setScrollTop(annotations.sitePanel.scrollTop());
            state.setGarnishing(false);

            state.setRecordingInterval(
              setInterval(() => {
                //console.log('Moving time ahead.');
                annotations.updateTimeDisplay(state.getTimeRecordedSoFar());
              }, 10)
            );
            void 0;
          }
        }
      },

      //
      // Movie playback code begins
      //

      updateFocus: (index) => {
        const focusRecord = state.getHistoryItem('focus', index);
        const currentlySelectedCell = Jupyter.notebook.get_selected_cell();
        if (currentlySelectedCell.metadata.hasOwnProperty('cellId') && currentlySelectedCell.metadata.cellId !== focusRecord.activeCellId) {
          const activeCellIndex = utils.findCellIndexByCellId(focusRecord.activeCellId); // we should use a map to speed this up
          Jupyter.notebook.select(activeCellIndex);
          const activeCell = utils.findCellByCellId(focusRecord.activeCellId);
          if (activeCell !== undefined) {
            activeCell.code_mirror.focus();
          }
        }
      },


      updatePointer: (record) => {
        if (record.hoverCell !== undefined) {
          const hoverCellElement = $(record.hoverCell.element[0]);
          const cellRect = hoverCellElement[0].getBoundingClientRect();
          const innerCell = hoverCellElement.find('.inner_cell')[0];
          const innerCellRect = innerCell.getBoundingClientRect();
          //console.log('hoverCellId:', record.hoverCell.metadata.cellId, 'rect:', innerCellRect);
          const dxScaled = parseInt(innerCellRect.width * record.dx);
          const dyScaled = parseInt(innerCellRect.height * record.dy);
          const offsetPosition = {
            x : innerCellRect.left + dxScaled,
            y : innerCellRect.top + dyScaled
          };
          const lastPosition = state.getLastRecordingCursorPosition();
          const lastGarnishInfo = state.getLastGarnishInfo();
          if (record.garnishing) {
            //console.log('lastGarnishInfo:', lastGarnishInfo);
            annotations.placeCanvas(record.cellId,record.garnishStyle);
            annotations.setCanvasStyle(record.cellId, record.garnishStyle);
            // We are currently garnishing, so draw next portion of garnish on canvas.
            //console.log('garnishing from:', lastGarnishInfo.x, lastGarnishInfo.y, '->', dxScaled, dyScaled);
            const garnishOffset = { x: dxScaled + (innerCellRect.left - cellRect.left), y: dyScaled + (innerCellRect.top - cellRect.top) };
            if (lastGarnishInfo.garnishing && lastGarnishInfo.garnishCellId == record.cellId) {
              annotations.updateGarnishDisplay(record.cellId, lastGarnishInfo.x, lastGarnishInfo.y, garnishOffset.x + 0.5, garnishOffset.y + 0.5, record.garnishStyle);
            }
            state.setLastGarnishInfo(garnishOffset.x, garnishOffset.y, record.garnishing, record.garnishStyle, record.cellId);
          } else {
            if (lastGarnishInfo.garnishing) {
              // garnish rendering just ended
              state.setLastGarnishInfo(dxScaled, dyScaled, record.garnishing, record.garnishStyle, record.cellId);
            }
          }
          if ((offsetPosition.x !== lastPosition.x) || (offsetPosition.y !== lastPosition.y)) {
            // Show cursor whenever it's moved by user
            //console.log('Showing cursor:', offsetPosition, lastPosition);
            const offsetPositionPx = { left: offsetPosition.x + 'px', top: offsetPosition.y + 'px'};
            annotations.recordingCursor.css(offsetPositionPx);
          }
          state.setLastRecordingCursorPosition(offsetPosition);
        }
      },

      updateView: (viewIndex) => {
        let record = state.getHistoryItem('view', viewIndex);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        // Select whatever cell is currently selected
        if (record.selectedCellId !== undefined) {
          const selectedCellIndex = utils.findCellIndexByCellId(record.selectedCellId); // we should use a map to speed this up
          //console.log('about to select index:', selectedCellIndex)
          Jupyter.notebook.select(selectedCellIndex);
          const selectedCell = utils.findCellByCellId(record.selectedCellId);
          if (selectedCell !== undefined) {
            selectedCell.code_mirror.focus();
          }
        }

        if (record.pointerUpdate) {
          annotations.recordingCursor.show();
          annotations.updatePointer(record);
        } else {
          annotations.recordingCursor.hide();
        }

        // Update innerScroll if required
        if (record.hoverCell) {
          const cm = record.hoverCell.code_mirror;
          cm.scrollTo(record.innerScroll.left, record.innerScroll.top);


          // Compute mapped scrollTop for this timeframe
          const currentNotebookPanelHeight = annotations.notebookPanel.height();
          const scrollRatio = record.scrollTop / record.notebookPanelHeight;
          const mappedScrollTop = scrollRatio * currentNotebookPanelHeight;

          // Compute offset to hoverCell from history value mapped to current panel height, to current cell position
          const hoverCellElement = $(record.hoverCell.element[0]);
          const hoverCellTop = hoverCellElement.position().top;
          const mappedTop = (record.cellPositionTop / record.notebookPanelHeight) * currentNotebookPanelHeight;
          const positionDifference = hoverCellTop - mappedTop;

          // Compute difference in cell sizes of the history hoverCell size to current cell size, and subtract half of that difference
          // in order to offset cell size changes
          const mappedHeight = record.innerCellRect.height * (record.notebookPanelHeight / currentNotebookPanelHeight);
          const heightDiff = $(hoverCellElement.find('.inner_cell')[0]).height() - mappedHeight;
          const heightDiffAdjustment = -0.5 * heightDiff;

          // Now the updated scrollTop is computed by adding all three values together.
          const scrollTop = parseInt(mappedScrollTop + positionDifference + heightDiffAdjustment);

          const currentScrollTop = annotations.sitePanel.scrollTop();
          if (currentScrollTop !== scrollTop) {
            annotations.sitePanel.scrollTop(scrollTop);
          }
        }
      },

      updateSelections: (index) => {
        // Preserve scrollTop position because latest CM codebase sometimes seems to change it when you setSelections.
        const currentScrollTop = annotations.sitePanel.scrollTop();
        
        const record = state.getHistoryItem('selections', index);
        let selectionsUpdated = false;
        let cellId, cell, selections, code_mirror, currentSelections, active;
        for (cellId of Object.keys(record.cellsSelections)) {
          selections = record.cellsSelections[cellId].selections;
          active = record.cellsSelections[cellId].active;
          cell = utils.findCellByCellId(cellId);
          if (cell !== undefined) {
            code_mirror = cell.code_mirror;
            currentSelections = utils.cleanSelectionRecords(code_mirror.listSelections());
            //console.log('cellId, selections, currentSelections:', cellId, selections, currentSelections);
            if (!(_.isEqual(selections,currentSelections))) {
              //console.log('updating selection, rec:', record, 'sel:', selections, 'cell:', cell);
              annotations.recordingCursor.hide();
              code_mirror.setSelections(selections);
              selectionsUpdated = true;
            }
          }
        }
        if (selectionsUpdated) {
          if (annotations.sitePanel.scrollTop() !== currentScrollTop) {
            void 0;
            annotations.sitePanel.scrollTop(currentScrollTop);
          }
        }
      },

      // Also, store outputs in content records and when a cell is executed create a content record.
      // On output change, back reference should be updated as well as contents change.

      updateContents: (index) => {
        const contentsRecord = state.getHistoryItem('contents', index);
        const cells = Jupyter.notebook.get_cells();
        let cellId, contents, outputs, frameContents, frameOutputs;
        for (let cell of cells) {
          if (cell.cell_type === 'code') {
            cellId = cell.metadata.cellId;
            contents = cell.get_text();
            outputs = cell.output_area.outputs;
            if (contentsRecord.cellsContent.hasOwnProperty(cellId)) {
              frameContents = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].contentsRecord, cellId);
              if (frameContents !== undefined && frameContents !== contents) {
                cell.set_text(frameContents);
              }
              frameOutputs = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].outputsRecord, cellId);
              if (frameOutputs !== undefined && frameOutputs.length > 0 && (!(_.isEqual(outputs, frameOutputs)))) {
                cell.clear_output();
                const output_type = frameOutputs[0].output_type;
                if (output_type === 'display_data' || output_type === 'stream') {
                  if ((output_type === 'stream') || (frameOutputs[0].hasOwnProperty('data') && !frameOutputs[0].data.hasOwnProperty('application/javascript'))) {
                    cell.output_area.handle_output({header: { msg_type: frameOutputs[0].output_type }, content: frameOutputs[0]});
                  }
                }
              }
            }
          }
        }
      },

      updateDisplay: (frameIndexes) => {
        annotations.updateContents(frameIndexes.contents);
        annotations.updateSelections(frameIndexes.selections);
        annotations.updateView(frameIndexes.view);
      },

      updateSlider: (playedSoFar) => {
        const ratio = playedSoFar / state.getHistoryDuration();
        const sliderVal = ratio * 1000;
        //console.log('updateSlider, playedSoFar:', playedSoFar, 'sliderVal:', sliderVal);
        const slider = $('#recorder-range');
        slider.val(sliderVal);
      },

      updateTimeDisplay: (timeSoFar) => {
        const timeDisplay = utils.formatTime(timeSoFar);
        const activity = state.getActivity();
        const recorderTimeDisplay = (activity === 'recording' ? $('.recorder-time-display-recording:first') : $('.recorder-time-display:first'));
        recorderTimeDisplay.text(timeDisplay);
      },

      //
      // Playback functions
      //

      handleSliderDrag: () => {
        // Handle slider drag
        const target = $('#recorder-range');
        const timeLocation = target.val() / 1000;
        //console.log('slider value:', timeLocation);
        state.clearSetupForReset();
        annotations.recordingCursor.show();
        const t = Math.min(state.getHistoryDuration() * timeLocation, state.getHistoryDuration() - 1);
        // Now we need to set the time we are going to start with if we play from here.
        state.setPlaybackTimeElapsed(t);
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        annotations.updateDisplay(frameIndexes);
        annotations.updateTimeDisplay(t);
      },

      // Stop any ongoing playback
      stopPlayback: () => {
        if (state.getActivity() !== 'playing')
          return;

        clearInterval(state.getPlaybackInterval());
        state.setActivity('playbackPaused');
        annotations.togglePlayButtons();
        audio.stopPlayback();
        state.setPlaybackTimeElapsed();
        // annotations.dockCursor();

        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();

        // Save after play stops, so if the user reloads we don't get the annoying dialog box warning us changes were made.
        // annotations.saveNotebook();

        void 0;
      },

      cancelPlaybackNoVisualUpdates: () => {
        annotations.stopPlayback();
        state.setGarnishing(false);
        state.resetPlayState();
        state.setActivity('idle');
        state.restoreCellStates('contents');
        utils.saveNotebook();
        state.restoreCellStates('selections');
      },

      cancelPlayback: () => {
        const activity = state.getActivity();
        if ((activity !== 'playing') && (activity !== 'playbackPaused')) {
          return;
        }

        void 0;
        annotations.cancelPlaybackNoVisualUpdates();
        annotations.recordingCursor.hide();
        annotations.clearAllCanvases();
        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();
        annotations.sitePanel.animate({ scrollTop: state.getScrollTop() }, 750);
      },

      startPlayback: () => {
        // start playback
        void 0;
        const activity = state.getActivity();
        if (activity === 'idle') {
          // If just starting to play back, store all cells current contents so we can restore them when you cancel playback.
          utils.saveNotebook();
          annotations.clearRecorderHint(); // clear any recorder hint e.g. "play your new movie"
          state.setLastGarnishInfo(0,0,false, 'highlight'); // make sure we've turned off any garnishing flag from a previous interrupted playback
          state.setScrollTop(annotations.sitePanel.scrollTop());
          state.storeCellStates();
          // Restore all cell outputs seen when a recording began
          //annotations.restoreAllCellOutputs();
        }

        annotations.clearAllCanvases();
        annotations.recordingCursor.show();
        state.setActivity('playing');

        annotations.togglePlayButtons();

        if (state.resetOnNextPlay) {
          void 0;
          state.resetPlayState();
        }

        state.setPlaybackStartTime(new Date().getTime() - state.getPlaybackTimeElapsed());

        if (!state.getMute()) {
          audio.startPlayback(state.getPlaybackTimeElapsed());
        }

        // Set up main playback loop on a 10ms interval
        state.setPlaybackInterval(
          setInterval(() => {
            //console.log('Moving time ahead.');
            const playedSoFar = state.getTimePlayedSoFar();
            if (playedSoFar >= state.getHistoryDuration()) {
              // reached end of recording naturally, so set up for restart on next press of play button
              annotations.togglePlayBack();
              state.setupForReset();
            } else {
              annotations.updateSlider(playedSoFar);
              annotations.updateTimeDisplay(playedSoFar);
              const frameIndexes = state.getHistoryRecordsAtTime(playedSoFar);
              annotations.updateDisplay(frameIndexes);
            }
          }, 10)
        );
      },

      togglePlayBack: () => {
        const activity = state.getActivity();
        if (activity !== 'recording') {
          if (activity === 'playing') {
            annotations.stopPlayback();
          } else {
            annotations.startPlayback();
          }
          annotations.updateControlsDisplay();
        }
      },

      loadAndPlayMovie: (cellId, recordingId) => {
        annotations.cancelPlayback(); // cancel any ongoing movie playback b/c user is switching to a different movie
        storage.loadMovie(cellId, recordingId).then( () => {
          void 0;
          annotations.togglePlayBack();
        }).catch( (ex) => {
          dialog.modal({
            title: 'Movie is not available.',
            body: 'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
            sanitize:false,
            buttons: {
              'OK': { click: (e) => { void 0; } }
            }
          });

          void 0;
        });

      },

      togglePlayButtons: () => {
        if (state.getActivity() === 'playing') {
          $('#btn-play').hide();
          $('#btn-stop-play').show();
        } else if (state.getActivity() === 'idle') {
          $('#btn-play').show();
          $('#btn-stop-play').hide();
        }
      },

      playRecordingById: (recordingFullId) => {
        const parts = recordingFullId.split('_');
        const cellId = parts[0];
        const recordingId = parts[1];
        annotations.loadAndPlayMovie(cellId, recordingId);
      },

      playRecordingByIdWithPrompt: (recordingFullId) => {
        const parts = recordingFullId.split('_');
        const cellId = parts[0];
        const recordingId = parts[1];
        annotations.loadAndPlayMovie(cellId, recordingId);
      },

      // if true is passed in, we display authoring controls. if false, we don't and you can only play back recordings.
      // when the plugin is used, false is passed in.
      setAuthoringMode: (authoringMode) => {
      },

    };

    // Functions exposed externally
    return {
      init: annotations.init,
      playRecordingById: annotations.playRecordingById,
      playRecordingByIdWithPrompt: annotations.playRecordingByIdWithPrompt,
      cancelPlayback: annotations.cancelPlayback,
      removeAllAnnotations: annotations.removeAllAnnotationsPrompt,
      setAccessLevel: (level) => { 
        state.setAccessLevel(level); 
        annotations.updateControlsDisplay();
      }
    }

  })();

  return Annotations;

});
