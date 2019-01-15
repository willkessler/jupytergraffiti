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

    _makeTerminal: (element, terminalId, wsUrl) => {
      const ws = new WebSocket(wsUrl);
      terminalLib.applyAddon(fit);
      const term = new terminalLib();
      term.id = terminalId;
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

        term.on('focus', () => { 
          console.log('terminal ' + term.id + ' focused');
          terminals.focusedTerminal = term;
        });
        term.on('blur', () => { 
          console.log('terminal defocused'); 
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
              console.log('received string of length:', json_msg[1].length, 'from server');
              break;
            case "disconnect":
              term.write("\r\n\r\n[CLOSED]\r\n");
              break;
          }
        };
      };
      return {socket: ws, term: term};
    },

    getFocusedTerminal: () => {
      return terminals.focusedTerminal;
    },

    createTerminalCell: (cellId) => {
      const cell = utils.findCellByCellId(cellId);
      if (cell !== undefined) {
        const cellJq = $(cell.element);
        const renderArea = cellJq.find('.rendered_html');
        renderArea.html('Loading...');

        const terminalContainerId = 'terminal-container-' + cellId;
        const dummyOutput = '012345678901234567890123'.split('').join("\n") + "\n";
        renderArea.html('<div style="position:absolute; left:-1000em">' +
                        '  <pre id="dummy-screen" style="border: solid 5px white;" class="terminal">' + dummyOutput +
                        '    <span id="dummy-screen-rows" style="">01234567890123456789012345678901234567890123456789012345678901234567890123456789</span>' +
                        '  </pre>' +
                        '</div>' +
                        '<div id="' + terminalContainerId + '" class="container" style="width:100%;height:250px;"></div>')
                  .show();
        const wsUrl = location.protocol.replace('http', 'ws') + '//' + location.host + '/terminals/websocket/' + cellId;
        const elem = $('#' + terminalContainerId);
        const sizeObj = {cols:40, rows:10};
        const newTerminal = terminals._makeTerminal(elem[0], cellId, wsUrl);
        elem.bind('click', () => { newTerminal.term.focus(); });

        return newTerminal;
      } else {
        return undefined;
      }
    },

    createTerminalCellAboveSelectedCell: () => {
      const newTerminalCell = Jupyter.notebook.insert_cell_above('markdown');
      if (newTerminalCell !== undefined) {
        const newTerminalCellId = utils.getMetadataCellId(newTerminalCell.metadata);
        if (newTerminalCellId !== undefined) {
          const graffitiConfig = {
            type : 'terminal',
            initCommand: '',
            terminalId: newTerminalCellId, // defaults to the graffiti cell id, but can be changed if author wants to display the same terminal twice in one notebook.
            runGraffitiOnCellExecute: '',
            dimensions: {
              rows:12,
              cols:120
            }
          };
          utils.assignCellGraffitiConfig(newTerminalCell, graffitiConfig);
          newTerminalCell.set_text('<i>Loading shell (' + newTerminalCellId + '), please wait...</i>');
          newTerminalCell.render();
          return terminals.createTerminalCell(newTerminalCellId);
        }
      }
      return undefined;
    },

    // If there are terminals present in this notebook, render them.
    renderAllTerminals: () => {
      const cells = Jupyter.notebook.get_cells();
      let cell, cellId;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        if (cell.cell_type === 'markdown') {
          if (cell.metadata.hasOwnProperty('graffitiConfig')) {
            cellId = utils.getMetadataCellId(cell.metadata);
            if (cell.metadata.graffitiConfig.type === 'terminal') {
              terminals.createTerminalCell(cellId);
            }
          }
        }
      }
    },

    init: () => {
      // Insert the menu item that allows the user to create new terminals.
      $('<li id="insert_terminal_above" title="Insert a terminal cell above the currently active cell">' +
        '<a href="#">Insert Terminal Above</a></li>').appendTo($('#insert_menu'));
      $('#insert_terminal_above').click(() => { 
        window.latestTerminal = terminals.createTerminalCellAboveSelectedCell();
        utils.saveNotebook();
      });

      terminals.renderAllTerminals();
    },


  }

  return terminals;

});
