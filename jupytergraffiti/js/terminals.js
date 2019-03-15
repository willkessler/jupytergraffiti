//
// Modeled on jupyter's terminado.js, but modified a lot for Graffiti usage.
//
// xterm, xterm's css and its fit addon were downloaded and put in the graffiti code base, from here:
// "xterm.js": "https://unpkg.com/xterm@~3.11.0/dist/xterm.js"
// "xterm.js-fit": "https://unpkg.com/xterm@~3.11.0/dist/addons/fit/fit.js"
// "xterm.js-css": "https://unpkg.com/xterm@~3.11.0/dist/xterm.css"

define ([
  'base/js/utils',
  './utils.js',
  './localizer.js',
  './xterm/xterm.js',
  './xterm/addons/fit/fit.js',
], (jupyterUtils, utils, localizer, terminalLib, fit) => {
  const terminals = {

    focusedTerminal: undefined,
    singleCDCommand: false,
    CDCommandCount : 0,
    terminalsList: {},

    _makeTerminal: (element, terminalId, wsUrl, sizeObj) => {
      //console.log('makeTerminal,wsUrl:', wsUrl);
      const ws = new WebSocket(wsUrl);
      terminalLib.applyAddon(fit);
      const term = new terminalLib({ 
        scrollback: 10000, 
        theme: { 
          foreground:'white',
          background: '#222',
          // foreground: 'black',
          // background: '#eee',
          selection: '#fff',
          cursor:'#f73', 
          cursorAccent: '#f22' 
        }
      });
      term.id = terminalId;
      // contents: contains all chars in and out of the terminal over the socket.
      let termObject = {
        socket: ws, 
        term: term, 
        contents: '',
        socketOpen: false,
        sendQueue: [],
        send: (data) => {
          if (termObject.socketOpen) {
            ws.send(JSON.stringify(['stdin',data]));
          } else {
            termObject.sendQueue.push(data);
          }
        }
      };
      ws.onopen = function(event) {
        termObject.socketOpen = true;
        for (let data of termObject.sendQueue) {
          // Send any commands queued up before the socket was ready, down the pipe
          ws.send(JSON.stringify(['stdin',data])); 
        }
        term.on('data', function(data) {
          ws.send(JSON.stringify(['stdin', data]));
        });

        // term.on('keydown', (data) => {
        //  console.log('keypress data:', data);
        // });
        
        //term.on('scroll', (data) => {
          //console.log('term scroll:', data);
        //});

        // term.on('selection', (data) => {
        //   console.log('term selection:', term.getSelection());
        // });

        term.on('focus', () => { 
          //console.log('Graffiti: terminal ' + term.id + ' focused');
          terminals.focusedTerminal = term.id;
        });

        term.on('blur', () => { 
          // console.log('terminal defocused'); 
          terminals.focusedTerminal = undefined;
        });

        term.on('refresh', (data) => {
          const checkYdisp = term._core.buffer.ydisp;
          if (term.storedYdisp !== undefined) {
            if (term.storedYdisp != checkYdisp) {
              terminals.eventsCallback({ 
                id: term.id,
                type: 'refresh',
                scrollLine: checkYdisp
              });
              //console.log('Graffiti: terminal refresh delta:', term.storedYdisp, checkYdisp);
            }
          }
          term.storedYdisp = term._core.buffer.ydisp;
        });

        term.open(element);
        term.fit();
        // Send the terminal size to the server.
        ws.send(JSON.stringify(["set_size", term.rows, term.cols,
                                window.innerHeight, window.innerWidth]));
        // Also call term.fit() again after 1second, because sometimes xterm hasn't made the width wide enough yet and we fit to one column wide.
        // In theory, v3.11 of xterm has addressed this bug, but this is in here as a safety mechanism in case that's actually not true.
        setTimeout(() => {
          term.fit();
        }, 1000); 

        ws.onmessage = function(event) {
          const json_msg = JSON.parse(event.data);
          switch(json_msg[0]) {
            case "stdout":
              const newChars = json_msg[1];
              term.write(newChars);
              term.storedYdisp = term._core.buffer.ydisp;
              //console.log('received newCharslength:', newChars.length, newChars);
              termObject.contents += newChars;
              terminals.eventsCallback({ 
                id: term.id,
                scrollLine: term.storedYdisp,
                position: termObject.contents.length,
                focusedTerminal: terminals.focusedTerminal,
                firstRecord: false,
              });
              // console.log('termId:', terminalId,'received string of length:', json_msg[1].length, 'from server, contents now has:', termObject.contents);
              break;
            case "disconnect":
              term.write("\r\n\r\n[CLOSED]\r\n");
              break;
          }
        };
      };

      return termObject;
    },

    getFocusedTerminal: () => {
      return terminals.focusedTerminal;
    },

    // Get enough content to fill a terminal sufficiently during scrubbing or just starting playback.
    // We don't restore the entire contents we may have had for the terminal because it could be huge,
    // but we restore about 4x the terminal contents so you can scroll back a bit and to account for
    // curses program output and multibyte characters, etc.
    getContentToFillTerminal: (terminal, contents, contentsPointer) => {
      const portionMultiplier = 8;
      const term = terminal.term;
      const portionLength = (term.rows * term.cols) * portionMultiplier;
      const contentsPortion = contents.substr(Math.max(0,contentsPointer - portionLength), contentsPointer);
      //const contentsPortion = contents.substr(0, contentsPointer);
      //console.log('contentsPointer:', contentsPointer);
      return contentsPortion;
    },

    createTerminalCell: (cellId, config) => {
      if (terminals.terminalsList.hasOwnProperty(cellId)) {
        return terminals.terminalsList[cellId]; // already have this terminal set up
      }
      const cell = utils.findCellByCellId(cellId);
      if (cell !== undefined) {
        const cellJq = $(cell.element);
        const renderArea = cellJq.find('.rendered_html');

        renderArea.html('<div>' +
                        '  <span id="dummy-screen-rows" style="font-family:courier; font-weight:bold; font-size:15px;">bash-3.2$ </span>' +
                        '</div>');
        const lineHeight = renderArea.find('#dummy-screen-rows').height();
        renderArea.html('Loading...');

        const terminalHeight = lineHeight * config.rows; // pixels
        const terminalContainerId = 'terminal-container-' + cellId;

        renderArea.html('<div class="graffiti-terminal-container" id="' + terminalContainerId + '" class="container" style="width:100%;height:' + terminalHeight + 'px;"></div>' +
                        '<div class="graffiti-terminal-links">' +
                        ' <div class="graffiti-terminal-go-notebook-dir">' + localizer.getString('JUMP_TO_NOTEBOOK_DIR') + '</div>' +
                        ' <div class="graffiti-terminal-reset">' + localizer.getString('RESET_TERMINAL') + '</div>' +
                        '</div>').show();
        const wsUrl = location.protocol.replace('http', 'ws') + '//' + location.host + '/terminals/websocket/' + config.terminalId;
        const elem = $('#' + terminalContainerId);
        const sizeObj = {cols:40, rows:10};
        renderArea.find('.graffiti-terminal-reset').click((e) => {
          const target = $(e.target);
          const cellDOM = target.parents('.cell');
          const cellId = cellDOM.attr('graffiti-cell-id');
          terminals.resetTerminalCell(cellId);
        });

        renderArea.find('.graffiti-terminal-container').bind('mousewheel', (e) => {
          //console.log('xterm mousewheel',e.originalEvent.wheelDeltaY); // looks like values about 10 move one line...
        });

        const newTerminal = terminals._makeTerminal(elem[0], cellId, wsUrl, sizeObj);
        terminals.terminalsList[cellId] = newTerminal;

        elem.bind('click', () => { newTerminal.term.focus(); });

        const notebookDirectory = utils.getNotebookDirectory();
        //console.log('Graffiti: notebookDirectory:', notebookDirectory);
        if (notebookDirectory !== undefined) {
          // in theory we could check to see if we're already in the directory we are supposed to be in using basename:
          // https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash
          const cdCommand = "" + 'if test -d ' + notebookDirectory + '; then cd ' + notebookDirectory + "; fi && clear\n";
          if (!terminals.singleCDCommand || (terminals.singleCDCommand && terminals.CDCommandCount < 1)) {
            newTerminal.send(cdCommand);
            terminals.CDCommandCount++;
          }
          renderArea.find('.graffiti-terminal-go-notebook-dir').click((e) => {
            newTerminal.send(cdCommand);
          });
        } else {
          renderArea.find('.graffiti-terminal-go-notebook-dir').hide(); // if this link is inactive, just hide it.
        }

        return newTerminal;
      } else {
        return undefined;
      }
    },

    createTerminalInCell: (cell, terminalId) => {
      const cellId = utils.getMetadataCellId(cell.metadata);
      if (terminalId === undefined) {
        terminalId = cellId;
      }
      if (cellId !== undefined) {
        const notebookDirectory = utils.getNotebookDirectory();
        const graffitiConfig = {
          type : 'terminal',
          startingDirectory: notebookDirectory,
          terminalId: terminalId, // defaults to the graffiti cell id, but can be changed if author wants to display the same terminal twice in one notebook.
          rows: 6, // default is 6 but can be changed in metadata
        };
        utils.assignCellGraffitiConfig(cell, graffitiConfig);
        cell.set_text('<i>Loading terminal (' + cellId + '), please wait...</i>');
        cell.render();
        return terminals.createTerminalCell(cellId, graffitiConfig);
      }
    },

    refreshTerminalCell: (cellId) => {
      if (terminals.terminalsList[cellId] !== undefined) {
        // Create a new terminal id so we'll connect to a fresh socket.
        const term = terminals.terminalsList[cellId].term;
        term.refresh(0,100000);
        term.focus();        
      }
    },

    resetTerminalCell: (cellId) => {
      if (terminals.terminalsList[cellId] !== undefined) {
        const fetchParams = { method: 'delete', credentials: 'include',  };
        const cell = utils.findCellByCellId(cellId);
        const graffitiConfig = utils.getCellGraffitiConfig(cell);
        if (graffitiConfig !== undefined) {
          const deleteAPIEndpoint = location.origin + '/api/terminals/' + graffitiConfig.terminalId;
          const settings = { 
            // liberally cribbed from jupyter's codebase,
            // https://github.com/jupyter/notebook/blob/b8b66332e2023e83d2ee04f83d8814f567e01a4e/notebook/static/tree/js/terminallist.js#L110
            processData : false,
            type : "DELETE",
            dataType : "json",
            success : function () {
              console.log('Graffiti: successful terminal delete.');
            },
            error : utils.log_ajax_error,
          };
          jupyterUtils.ajax(deleteAPIEndpoint, settings);
        }
        delete(terminals.terminalsList[cellId]);
        terminals.createTerminalInCell(cell, utils.generateUniqueId() );
        utils.saveNotebook();
      }
    },

    // Just remove the cellId from the list we keep of terminals in the nb.
    removeTerminal: (cellId) => {
      delete(terminals.terminalsList[cellId]);
    },

    createTerminalCellAboveSelectedCell: () => {
      const newTerminalCell = Jupyter.notebook.insert_cell_above('markdown');
      if (newTerminalCell !== undefined) {
        return terminals.createTerminalInCell(newTerminalCell);
      }
      return undefined;
    },

    processRenderQueue: () => {
      if (terminals.renderQueue.length > 0) {
        const rq = terminals.renderQueue.shift();
        const cellId = utils.getMetadataCellId(rq.cell.metadata);
        // console.log('Processing render queue entry:', rq);
        terminals.createTerminalCell(cellId, rq.config);
        // make sure you can't double click this cell because that would break the terminal
        $(rq.cell.element[0]).unbind('dblclick').bind('dblclick', ((e) => { 
          e.stopPropagation();
          return false;
        }));
        setTimeout(terminals.processRenderQueue, 250);
      }
    },

    // If there are terminals present in this notebook, render them.
    renderAllTerminals: () => {
      const cells = Jupyter.notebook.get_cells();
      let cell, cellId;
      terminals.renderQueue = [];
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        if (cell.cell_type === 'markdown') {
          if (cell.metadata.hasOwnProperty('graffitiConfig')) {
            if (cell.metadata.graffitiConfig.type === 'terminal') {
              let config = $.extend({}, cell.metadata.graffitiConfig);
              if ((utils.getNotebookGraffitiConfigEntry('singleTerminal') !== undefined) &&
                  (utils.getNotebookGraffitiConfigEntry('singleTerminal') == "true")) {
                config.terminalId = utils.getNotebookGraffitiConfigEntry('id');
                terminals.singleCDCommand = true;
              }
              terminals.renderQueue.push({cell: cell, config: config });
            }
          }
        }
      }
      terminals.processRenderQueue();
    },

    backupTerminalOutput: (cellId) => {
      const terminal = terminals.terminalsList[cellId];
      if (terminal !== undefined) {
        terminal.contentsBackup = terminal.contents;
      }
    },

    setTerminalContents: (opts) => {
      const cellId = opts.id;
      const terminal = terminals.terminalsList[cellId];
      terminal.contents = opts.terminalsContents[cellId];
      //console.log('setTerminalContents', opts);
      if (terminal !== undefined) {
        if (!opts.incremental || opts.firstRecord || terminal.lastPosition === undefined) {
          terminal.term.reset();
          const portion = terminals.getContentToFillTerminal(terminal, terminal.contents, opts.position);
          terminal.term.write(portion);
          console.log('portion:', portion);
          terminal.lastPosition = opts.position;
        } else {
          if (terminal.lastPosition !== opts.position) {
            const newPortion = terminal.contents.substr(terminal.lastPosition, opts.position - terminal.lastPosition);
            console.log('writing newPortion', newPortion);
            //            for (let i = 0; i < newPortion.length; ++i) {
            //              terminal.term.write(newPortion[i]);
            //            }
            const weird = 'g++ -std=c++17 ./code/p \
rinting_ex_2.cpp && ./a.out' + String.fromCharCode(13) + String.fromCharCode(10);
            console.log('weirdlen:', weird.length);
            console.log('newPortion len:', newPortion.length);
            if (newPortion.substr(0,3) === 'g++') {
              let ascii = [[],[]], i;
              for (i = 0; i < weird.length; ++i) {
                ascii[0].push(weird.charCodeAt(i));
              }
              for (i = 0; i < newPortion.length; ++i) {
                ascii[1].push(newPortion.charCodeAt(i));
              }
              console.log('ascii:', ascii);
              for (i = 0; i < weird.length; ++i) {
                if (weird[i] !== newPortion[i]) {
                  debugger;
                }
              }
              terminal.term.write(weird);
            } else {
              terminal.term.write(newPortion);
            }
            terminal.lastPosition = opts.position;
          }
        }
        // Scroll to the correct spot if needed
        terminals.scrollTerminal(opts);
      }
    },

    clearTerminalsContentsPositions: () => {
      for (let cellId of Object.keys(terminals.terminalsList)) {
        terminals.terminalsList[cellId].lastPosition = undefined;
      }
    },

    focusTerminal: (cellId) => {
      const termRecord = terminals.terminalsList[cellId];
      if (termRecord !== undefined) {
        const cell = utils.findCellByCellId(cellId);
        cell.focus_cell();
        terminals.focusedTerminal = cellId;
        termRecord.term.focus();
      }
    },

    scrollTerminal: (opts) => {
      const termRecord = terminals.terminalsList[opts.id];
      if (termRecord !== undefined) {
        const term = termRecord.term;
        // Basically the same functionality as in scrollToLine, see here:
        // https://github.com/xtermjs/xterm.js/blob/c908da351b11d718f8dcda7424baee4bd8211681/src/Terminal.ts#L1302
        const scrollAmount = opts.scrollLine - term._core.buffer.ydisp;
        if (scrollAmount !== 0) {
          term.scrollLines(scrollAmount);
        }
      }
    },
      
    restoreTerminalOutput: (cellId) => {
      const terminal = terminals.terminalsList[cellId];
      if (terminal !== undefined) {
        if (terminal.contentsBackup !== undefined) {
          if (terminal.contents != terminal.contentsBackup) {
            terminal.contents = terminal.contentsBackup;
            terminal.term.reset();
            terminal.term.write(terminal.contents);
          }
        }
      }      
    },

    saveOrRestoreTerminalOutputs: (action) => {
      for (let cellId of Object.keys(terminals.terminalsList)) {
        if (action === 'save') {
          terminals.backupTerminalOutput(cellId);
        } else {
          terminals.restoreTerminalOutput(cellId);
        }
      }
    },

    getTerminalsStates: (markAsFirstRecord) => {
      const states = [];
      for (let cellId of Object.keys(terminals.terminalsList)) {
        terminal = terminals.terminalsList[cellId];
        states.push({
          id: cellId,
          scrollLine: terminal.term._core.buffer.ydisp,
          position: terminal.contents.length,
          isFocused: (terminals.focusedTerminal === cellId),
          focusedTerminal: terminals.focusedTerminal,
          firstRecord: markAsFirstRecord,
        });
      }
      return states;
    },

    getTerminalsContents: () => {
      const contents = {};
      let terminal;
      for (let cellId of Object.keys(terminals.terminalsList)) {
        terminal = terminals.terminalsList[cellId];
        contents[cellId] = terminal.contents;
      }
      return contents;
    },

    refitAllTerminals: () => {
      let terminal;
      for (let cellId of Object.keys(terminals.terminalsList)) {
        terminal = terminals.terminalsList[cellId];
        //console.log('Running fit on term', terminal.term.rows, terminal.term.cols);
        terminal.term.fit();
        terminal.socket.send(JSON.stringify(["set_size", terminal.term.rows, terminal.term.cols,
                                             window.innerHeight, window.innerWidth]));
      }
    },

    isTerminalCell: (cellId) => {
      return (terminals.terminalsList[cellId] !== undefined);
    },

    runTerminalCommand: (terminalId, command, addCR) => {
      // Inject the terminal command into the target terminal (if found).
      if (terminals.terminalsList[terminalId] !== undefined) {
        const term = terminals.terminalsList[terminalId];
        term.send(command);
        if (addCR) {
          term.send("\n");
        }
      }
    },

    init: (eventsCallback) => {
      terminals.eventsCallback = eventsCallback;
      terminals.renderAllTerminals();
    },


  }

  return terminals;

});
