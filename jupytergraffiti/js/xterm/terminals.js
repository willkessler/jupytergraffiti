//
// Modeled on jupyter's terminado.js, but modified a lot for Graffiti usage.
//
// xterm, xterm's css and its fit addon were downloaded and put in the graffiti code base, from here:
// "xterm.js": "https://unpkg.com/xterm@~3.1.0/dist/xterm.js"
// "xterm.js-fit": "https://unpkg.com/xterm@~3.1.0/dist/addons/fit/fit.js"
// "xterm.js-css": "https://unpkg.com/xterm@~3.1.0/dist/xterm.css"

define ([
  '/nbextensions/graffiti_extension/js/utils.js',
  '/nbextensions/graffiti_extension/js/xterm/xterm.js',
  '/nbextensions/graffiti_extension/js/xterm/addons/fit/fit.js',
], (utils, terminalLib, fit) => {
  const terminals = {

    focusedTerminal: undefined,
    terminalsList: {},

    _makeTerminal: (element, terminalId, wsUrl, sizeObj) => {
      const ws = new WebSocket(wsUrl);
      terminalLib.applyAddon(fit);
      const term = new terminalLib({ 
        scrollback: 10000, 
        theme: { 
          // foreground:'white',
          // background: '#444',
          foreground: 'black',
          background: '#eee',
          selection: '#fff',
          cursor:'#f73', 
          cursorAccent: '#f22' 
        }
      });
      term.id = terminalId;
      // contents: contains all chars in and out of the terminal over the socket
      // contentsPortion: contains latest subportion of those contents for recorded replay usage
      let termObject = {socket: ws, term: term, contents: '', contentsPortion: ''};
      ws.onopen = function(event) {
        term.on('data', function(data) {
          ws.send(JSON.stringify(['stdin', data]));
        });

        // term.on('keydown', (data) => {
        //  console.log('keypress data:', data);
        // });
        
        term.on('scroll', (data) => {
          console.log('term scroll:', data);
        });

        // term.on('selection', (data) => {
        //   console.log('term selection:', term.getSelection());
        // });

        term.on('focus', () => { 
          console.log('Graffiti: terminal ' + term.id + ' focused');
          terminals.focusedTerminal = term.id;
        });

        term.on('blur', () => { 
          // console.log('terminal defocused'); 
          terminals.focusedTerminal = undefined;
        });

        term.open(element);
        term.fit();
        // send the terminal size to the server.
        ws.send(JSON.stringify(["set_size", term.rows, term.cols,
                                window.innerHeight, window.innerWidth]));

        ws.onmessage = function(event) {
          const json_msg = JSON.parse(event.data);
          switch(json_msg[0]) {
            case "stdout":
              term.write(json_msg[1]);
              termObject.contents += json_msg[1];
              termObject.contentsPortion = terminals.getContentsPortion(termObject);
              terminals.eventsCallback({ 
                type: 'output',
                data: { 
                  id: term.id,
                  new: json_msg[1],
                  all: termObject.contents,
                  portion: termObject.contentsPortion,
                }
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

    getContentsPortion: (terminal) => {
      const portionMultiplier = 4;
      const term = terminal.term;
      const portionLength = (term.rows * term.cols) * portionMultiplier;
      const contentsPortion = terminal.contents.substr(Math.max(0,terminal.contents.length - portionLength));
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
                        ' <div class="graffiti-terminal-go-notebook-dir">Jump to Notebook\'s Dir</div>' +
                        ' <div class="graffiti-terminal-reset">Reset Terminal</div>' +
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

        const newTerminal = terminals._makeTerminal(elem[0], cellId, wsUrl, sizeObj);
        terminals.terminalsList[cellId] = newTerminal;

        elem.bind('click', () => { newTerminal.term.focus(); });

        if (config.startingDirectory !== undefined) {
          // in theory we could check to see if we're already in the directory we are supposed to be in using basename:
          // https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash
          const cdCommand = "" + 'cd ' + config.startingDirectory + "\n";
          renderArea.find('.graffiti-terminal-go-notebook-dir').click((e) => {
            newTerminal.term.send(cdCommand);
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
        const graffitiConfig = {
          type : 'terminal',
          startingDirectory: notebookPath,
          terminalId: terminalId, // defaults to the graffiti cell id, but can be changed if author wants to display the same terminal twice in one notebook.
          rows: 6, // default is 6 but can be changed in metadata
        };
        utils.assignCellGraffitiConfig(cell, graffitiConfig);
        cell.set_text('<i>Loading terminal (' + cellId + '), please wait...</i>');
        cell.render();
        return terminals.createTerminalCell(cellId, graffitiConfig);
      }
    },

    resetTerminalCell: (cellId) => {
      const cell = utils.findCellByCellId(cellId);
      if (cell.metadata.hasOwnProperty('graffitiConfig')) {
        if (cell.metadata.graffitiConfig.type === 'terminal') {
          // Create a new terminal id so we'll connect to a fresh socket.
          delete(terminals.terminalsList[cellId]);
          terminals.createTerminalInCell(cell, utils.generateUniqueId() );
          utils.saveNotebook();
        }
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
        console.log('Processing render queue entry:', rq);
        terminals.createTerminalCell(cellId, rq.cell.metadata.graffitiConfig);
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
              terminals.renderQueue.push({cell: cell, config: cell.metadata.graffitiConfig });
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

    loadWithPartialOutput: (cellId, portion) => {
      const terminal = terminals.terminalsList[cellId];
      if (terminal !== undefined) {
        terminal.term.reset();
        terminal.term.write(portion);
        terminal.contents = portion;
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

    collectAllTerminalsContents: () => {
      const contents = [];
      const focusedTerminal = terminals.getFocusedTerminal();
      for (let cellId of Object.keys(terminals.terminalsList)) {
        terminal = terminals.terminalsList[cellId];
        contents.push({
          type: 'output',
          id: cellId,
          portion: terminal.contentsPortion,
          focusedTerminal: focusedTerminal,
        });
      }
      return contents;
    },

    runTerminalCommand: (terminalId, command, addCR) => {
      // Inject the terminal command into the target terminal (if found).
      if (terminals.terminalsList[terminalId] !== undefined) {
        const term = terminals.terminalsList[terminalId];
        term.term.send(command);
        if (addCR) {
          term.term.send("\n");
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
