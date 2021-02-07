//
// Modeled on jupyter's terminado.js, but modified a lot for Graffiti usage.
//
// xterm, xterm's css and its fit addon were downloaded and put in the graffiti code base, from here:
// "xterm.js": "https://unpkg.com/xterm@~3.11.0/dist/xterm.js"
// "xterm.js-fit": "https://unpkg.com/xterm@~3.11.0/dist/addons/fit/fit.js"
// "xterm.js-css": "https://unpkg.com/xterm@~3.11.0/dist/xterm.css"

define ([
  'base/js/utils',
  'jupytergraffiti/js/utils.js',
  'jupytergraffiti/js/localizer.js',
  'jupytergraffiti/js/xterm/xterm.js',
  'jupytergraffiti/js/xterm/addons/fit/fit.js',
], (jupyterUtils, utils, localizer, terminalLib, fit) => {
  const terminals = {

    focusedTerminal: undefined,
    discoveredPwd: undefined,
    singleCDCommand: false,
    fitRetryTime: 1000,
    maxRefitAttempts: 10,
    CDCommandCount: 0,
    terminalsList: {},

    discoverPwd: () => {
      Jupyter.notebook.kernel.execute(
        'pwd',
        { iopub:
                {
                  output: (shellOutput) => { 
                    if (shellOutput && shellOutput.content && shellOutput.content.data) {
                      const pathWithTicks = shellOutput.content.data['text/plain']; // for some reason this comes back with single apostrophes around it
                      terminals.discoveredPwd = pathWithTicks.substr(1,pathWithTicks.length-2);
                      terminals.renderAllTerminals(); // only render the terminals after we know the pwd of this notebook
                    }
                  }
                }
        },
        { 
          silent: false
        }
      );
    },

    _makeTerminal: (element, cellId, terminalId, wsUrl, sizeObj) => {
      //console.log('makeTerminal,wsUrl:', wsUrl);
      const terminalPrefetchUrl = '/terminals/new/' + terminalId;
      return fetch(terminalPrefetchUrl, { credentials: 'include' }).then((results) => {
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
        term.id = cellId;
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
      });
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
        const terminalContainerId = 'graffiti-terminal-container-' + cellId;

        renderArea.html('<div class="graffiti-terminal-container" id="' + terminalContainerId + '" class="container" style="width:100%;height:' + terminalHeight + 'px;"></div>' +
                        '<div class="graffiti-terminal-links">' +
                        ' <div class="graffiti-terminal-go-notebook-dir">' + localizer.getString('JUMP_TO_NOTEBOOK_DIR') + '</div>' +
                        ' <div class="graffiti-terminal-reset">' + localizer.getString('RESET_TERMINAL') + '</div>' +
                        '</div>').show();

        const urlPathName = location.pathname;
        let host = location.host;
        let path = '/terminals/websocket/';
        if (urlPathName.indexOf('/notebooks/') > 0) {
          // In cases where Jupyter is hosted on a path-based VM, like on binder.org, we need to extract that path part 
          // and put it in front of the regular terminals endpoint.
          const parts = urlPathName.split(/\/notebooks\//,2);
          path = (parts[0].length > 0 ? parts[0] + path : path);
        }
        const wsUrl = location.protocol.replace('http', 'ws') + '//' + location.host + path + config.terminalId;
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

        return terminals._makeTerminal(elem[0], cellId, config.terminalId, wsUrl, sizeObj).then(
          (newTerminal) => { 
            terminals.terminalsList[cellId] = newTerminal;

            elem.bind('click', () => { newTerminal.term.focus(); });

            if (terminals.discoveredPwd !== undefined) {
              // in theory we could check to see if we're already in the directory we are supposed to be in using basename:
              // https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash
              const cdCommand = "" + 'if test -d ' + terminals.discoveredPwd + '; then cd ' + terminals.discoveredPwd + "; fi" +
                                "&& clear\n";
              if (!terminals.singleCDCommand || (terminals.singleCDCommand && terminals.CDCommandCount < 1)) {
                newTerminal.send(cdCommand);
                terminals.CDCommandCount++;
              }
              let resetCdCommand = cdCommand;
              renderArea.find('.graffiti-terminal-go-notebook-dir').click((e) => {
                if (terminals.discoveredPwd !== undefined) {
                  resetCdCommand = "" + 'cd ' + terminals.discoveredPwd + "&& clear\n";
                }
                newTerminal.send(resetCdCommand);
              });
            } else {
              renderArea.find('.graffiti-terminal-go-notebook-dir').hide(); // if this link is inactive, just hide it.
            }

            return newTerminal;
        });
      } else {
        return undefined;
      }
    },


    createTerminalInCell: (cell, terminalId, desiredRows) => {
      const cellId = utils.getMetadataCellId(cell.metadata);
      if (terminalId === undefined) {
        terminalId = cellId;
      }
      if (cellId !== undefined) {
        const notebookDirectory = utils.getNotebookDirectory();
        const rows = (desiredRows === undefined ? 6 : desiredRows); // default is 6 rows but can be changed by metadata
        const graffitiConfig = {
          type : 'terminal',
          startingDirectory: notebookDirectory,
          terminalId: terminalId, // defaults to the graffiti cell id, but can be changed if author wants to display the same terminal twice in one notebook.
          rows: rows, 
        };
        utils.assignCellGraffitiConfig(cell, graffitiConfig);
        utils.selectCellByCellId(cellId);
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
        const currentRows = terminals.terminalsList[cellId].term.rows;
        delete(terminals.terminalsList[cellId]);
        terminals.createTerminalInCell(cell, utils.generateUniqueId(), currentRows );
        utils.saveNotebookDebounced();
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
                  (utils.getNotebookGraffitiConfigEntry('singleTerminal') == "true")) { // note that the metadata entry has to be "true", not just true. (double quotes req'd)
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
      let cellId = opts.id;
      const newContents = opts.terminalsContents[cellId];
      let terminal = terminals.terminalsList[cellId];
      if (terminal === undefined) {
        console.log('Graffiti: cannot find terminal', cellId, 
                    'for sending output, trying to find next terminal from:', opts.nearestCellPosition);
        if (opts.nearestCellPosition === undefined || !opts.useNearestCellPosition) {
          return;
        }
        // Try to find a terminal after the nearest cell position. If you find one, dump output into that terminal. This happens because
        const cells = Jupyter.notebook.get_cells();
        let i, nearestCell, checkCellId;
        cellId = undefined;
        for (i = opts.nearestCellPosition + 1; i < cells.length; ++i) {
          nearestCell = cells[i];
          checkCellId = utils.getMetadataCellId(nearestCell.metadata);
          if (terminals.terminalsList.hasOwnProperty(checkCellId)) {
            cellId = checkCellId;
            console.log('Graffiti: We found a subsequent terminal and will write output to cell:', cellId);
            break;
          }
        }
        if (cellId === undefined) {
          return; // we couldn't find a terminal after the position passed in so we're going to give up and not try to write to any terminal.
        } else {
          terminal = terminals.terminalsList[cellId];
        }
      }
      terminal.contents = newContents;
      let madeUpdateToTerminal = false;
      if (terminal !== undefined) {
        let didScroll = false;
        if (!opts.incremental || opts.firstRecord || terminal.lastPosition === undefined) {
          terminal.term.reset();
          const portion = terminals.getContentToFillTerminal(terminal, terminal.contents, opts.position);
          terminal.term.write(portion);
          terminal.lastPosition = opts.position;
          madeUpdateToTerminal = true;
        } else {
          //console.log('setTerminalContents, opts:', opts, 'lastPosition', terminal.lastPosition, 'opts.position', opts.position);
          if (terminal.lastPosition !== opts.position) {
            const newPortion = terminal.contents.substr(terminal.lastPosition, opts.position - terminal.lastPosition);
            // Replace CR followed by a character NOT a line feed by the non-linefeed char alone. 
            // Sometimes we've gotten this weird situation with terminal recordings and this causes recorded
            // text to write over itself on the same line.
            const newPortionCleaned = newPortion.replace(/([\x0d])([^\x0a])/g, "$2"); 
            terminal.term.write(newPortionCleaned);
            terminal.lastPosition = opts.position;
            terminal.term.scrollToBottom();
            didScroll = true;
            madeUpdateToTerminal = true;
          }
        }
        // Scroll to the correct spot if needed
        if (!didScroll) {
          madeUpdateToTerminal = madeUpdateToTerminal || terminals.scrollTerminal(opts);
        }
      }
      return madeUpdateToTerminal;
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
        //console.log('scrollTerminal: opts.scrollLine', opts.scrollLine, 'ydisp', term._core.buffer.ydisp, 'scrollAmount', scrollAmount);
        if (scrollAmount !== 0) {
          term.scrollLines(scrollAmount);
          return true;
        }
      }
      return false;
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

    getTerminalContents: (terminalId) => {
      const terminal = terminals.terminalsList[terminalId];
      return terminal.contents;
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

    refitOneTerminal: (terminal, cellId) => {
      const refitTerminal = (tryNumber) => {
        console.log('Graffiti: Attempting to fit terminal:', cellId, ', attempt number', tryNumber);
        terminal.term.fit();
        terminal.socket.send(JSON.stringify(["set_size", terminal.term.rows, terminal.term.cols,
                                             window.innerHeight, window.innerWidth]));
        console.log('Graffiti: fit terminal succeeded for:', cellId);
      };
      console.log('Graffiti: Running fit on term', terminal.term.rows, terminal.term.cols);
      let refitAttempts = 0;
      const refitInterval = setInterval(() => {
        try {
          ++refitAttempts;
          refitTerminal(refitAttempts);
          clearInterval(refitInterval);
        } catch (ex) {
          if (refitAttempts > terminals.maxRefitAttempts) {
            console.log('Graffiti: unable to call fit() after', refitAttempts, 'tries, giving up.');
            clearInterval(refitInterval);
          } else {
            console.log('Graffiti: unable to call fit(), trying again in', terminals.fitRetryTime, 'seconds.');
          }
        }
      }, terminals.fitRetryTime);
    },        

    refitAllTerminals: () => {
      let terminal;
      let term;
      for (let cellId of Object.keys(terminals.terminalsList)) {
        terminal = terminals.terminalsList[cellId];
        term = terminal.term;
        terminals.refitOneTerminal(terminal, cellId);
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
      terminals.discoverPwd();
      terminals.eventsCallback = eventsCallback;
    }

  }

  return terminals;

});
