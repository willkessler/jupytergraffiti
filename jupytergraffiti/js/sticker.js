define([
  'jupytergraffiti/js/utils.js'
], (utils) => {
  // Thanks to https://stackoverflow.com/questions/3642035/jquerys-append-not-working-with-svg-element
  const sticker = {

    interpretDashing: (opts,obj) => {
      if ((opts.dashed !== undefined) && (opts.dashed === 'dashed')) {
        if (opts.dashWidth) {
          obj['stroke-dasharray'] = opts.dashWidth;
        } else {
          obj['stroke-dasharray'] = 4;
        }
      }
    },
    
    // Cf : https://www.beyondjava.net/how-to-connect-html-elements-with-an-arrow-using-svg
    // and: https://stackoverflow.com/questions/43887340/how-to-include-the-arrow-head-in-the-length-of-a-line-in-svg
    generateArrowHeadElem: (arrowHeadColor, arrowHeadSize) => {
      const arrowHeadId = 'arrowHead-' + utils.generateUniqueId();
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = sticker.makeSvgElement('marker', {
        id: arrowHeadId,
        viewBox: '0 0 10 10',
        refX: 8.7,
        refY: 3,
        markerUnits: 'strokeWidth',
        markerWidth: arrowHeadSize,
        markerHeight: arrowHeadSize,
        orient: 'auto',
        stroke: arrowHeadColor,
        fill: arrowHeadColor
      });
      const path = sticker.makeSvgElement('path', {
        d: "M 0,0 L0,6 L9,3 z"
      });
      marker.appendChild(path);
      defs.appendChild(marker);
      return { 
        arrowHeadId: arrowHeadId, 
        defs: defs 
      };
    },
    
    makeElementHtml: (tag, attr, innerHtml) => {
      let elementHtml = '<' + tag + ' ';
      if (tag === 'svg') {
        elementHtml += 'xmlns="http://www.w3.org/2000/svg" version="1.1" class="graffitiSvg" ';
      }
      let attrHtml = '';
      if (attr !== undefined) {
        attrHtml = $.map(attr, (val, key) => { return (key + '="' + val + '"') } ).join(' ');
      }
      if (innerHtml !== undefined) {
        elementHtml += attrHtml + '>' + innerHtml + '</' + tag + '>';
      } else {
        elementHtml += attrHtml + '></' + tag + '>';
      }
      return elementHtml;
    },

    makeSvgElement: (tag, attrs) => {
      const el= document.createElementNS('http://www.w3.org/2000/svg', tag);
      if (tag === 'svg') {
        el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        el.setAttribute('version', '1.1');
        el.setAttribute('preserveAspectRatio', 'none')
      }
      for (let k in attrs) {
        el.setAttribute(k, attrs[k]);
      }
      if (attrs.text !== undefined) { 
        // Handle svg text content as a special case b/c it's not an attribute, cf :
        // https://stackoverflow.com/questions/14758125/setting-text-svg-element-dynamically-via-javascript
        el.textContent = attrs.text;
      }
      return el;
    },

    makeDomElement: (tag, attrs) => {
      const el= document.createElement(tag);
      for (let k in attrs) {
        el.setAttribute(k, attrs[k]);
      }
      return el;
    },

    renderSvg: (svgChildren, x, y, width, height, viewBox, arrowHeadRecord) => {
      let containerDiv, containerSticker, containerDivParams, metaParts;
      let svgGenerator = $('#graffitiSvgGenerator');
      if (svgGenerator.length === 0) {
        $('body').append($('<div id="graffitiSvgGenerator"></div>'));
        svgGenerator = $('#graffitiSvgGenerator');
      }
      for (let svgChild of svgChildren) {
        let transform = '';
        if (svgChild.hasOwnProperty('cssTransform')) {
          transform = 'transform:' + svgChild.cssTransform;
        }
        let backgroundColor = '';
        if (svgChild.hasOwnProperty('backgroundColor')) {
          backgroundColor = 'background:' + svgChild.backgroundColor + ';';
        }
        let border = '';
        if (svgChild.hasOwnProperty('border')) {
          border = 'border:' + svgChild.border + ';';
        }
        containerDivParams = {
          'class': svgChild.outerClass,
          'style' : 'position:absolute;' +
                    'left:' + parseInt(svgChild.x) + 'px;top:' + parseInt(svgChild.y) + 'px;' +
                    'width:' + parseInt(svgChild.width) + 'px;height:' + parseInt(svgChild.height) + 'px;' +
                    transform +
                    backgroundColor +
                    border
        };
        if (svgChild.hasOwnProperty('title')) {
          containerDivParams.title = svgChild.title;
        };
        if (svgChild.hasOwnProperty('metaTag')) {
          metaParts = svgChild.metaTag.split('|');
          containerDivParams[metaParts[0]] = metaParts[1];
        };
        containerDiv = sticker.makeDomElement('div',containerDivParams);
        containerSticker =
          sticker.makeSvgElement('svg',
                                 {
                                   width: svgChild.width,
                                   height: svgChild.height,
                                   viewBox: svgChild.viewBox
                                 });
        if (svgChild.usesArrow) {
          containerSticker.appendChild(svgChild.arrowHeadRecord.defs);
        }
        containerSticker.appendChild(svgChild.el);
        containerDiv.appendChild(containerSticker);
        svgGenerator[0].appendChild(containerDiv);
      }
      const containerHtml = svgGenerator[0].innerHTML;
      svgGenerator.empty();

      return containerHtml;
    },

    makeLine: (opts) => {
      const endpoints = opts.endpoints;
      const p1 = endpoints.p1;
      const p2 = endpoints.p2;
      const bbox = { 
        p1: {
          x: Math.min(p1.x, p2.x),
          y: Math.min(p1.y, p2.y)
        }, 
        p2: {
          x: Math.max(p1.x, p2.x),
          y: Math.max(p1.y, p2.y)
        }
      };
      const color = (opts.color === undefined ? '#000' : opts.color);
      const strokeWidth = (opts.strokeWidth === undefined ? 3 : opts.strokeWidth);
      let coordSpaceEndpoints;
      if ((p2.x < p1.x) &&
          (p2.y < p1.y)) {
        coordSpaceEndpoints = { 
          p1: {
            x: bbox.p2.x, y: bbox.p2.y
          },
          p2: {
            x: bbox.p1.x, y: bbox.p1.y
          }
        };
      } else if (p2.x < p1.x) {
        coordSpaceEndpoints = { 
          p1: {
            x: bbox.p2.x, y: bbox.p1.y
          },
          p2: {
            x: bbox.p1.x, y: bbox.p2.y
          }
        };
      } else if (p2.y < p1.y) {
        coordSpaceEndpoints = { 
          p1: {
            x: bbox.p1.x, y: bbox.p2.y
          },
          p2: {
            x: bbox.p2.x, y: bbox.p1.y
          }
        };
      } else {
        coordSpaceEndpoints = { 
          p1: {
            x: bbox.p1.x, y: bbox.p1.y
          },
          p2: {
            x: bbox.p2.x, y: bbox.p2.y
          }
        };
      }

      // Finally, translate coords into viewport space.
      const finalCoordSpaceEndpoints = {
        p1: {
          x: coordSpaceEndpoints.p1.x - bbox.p1.x, y: coordSpaceEndpoints.p1.y - bbox.p1.y
        },
        p2: {
          x: coordSpaceEndpoints.p2.x - bbox.p1.x, y: coordSpaceEndpoints.p2.y - bbox.p1.y
        }
      }
      const pathPart = 'M ' + finalCoordSpaceEndpoints.p1.x + ' ' + finalCoordSpaceEndpoints.p1.y + ' ' +
                       'L ' + finalCoordSpaceEndpoints.p2.x + ' ' + finalCoordSpaceEndpoints.p2.y;
      let pathObj = 
        {
          'vector-effect': 'non-scaling-stroke',
          'stroke-width' : strokeWidth,
          stroke: color,
          fill: color,
          d: pathPart
        };
      let arrowHeadRecord = undefined;
      if (opts.usesArrow !== undefined) {
        arrowHeadRecord = sticker.generateArrowHeadElem(opts.color, opts.arrowHeadSize);
        pathObj['marker-end'] =  'url(#' + arrowHeadRecord.arrowHeadId + ')';
      }
      sticker.interpretDashing(opts, pathObj);

      const line = sticker.makeSvgElement('path', pathObj);

      const viewBoxBuffer = 10;
      const minArrowBox = 10 + viewBoxBuffer;
      const viewBox = [-1 * viewBoxBuffer,
                      -1 * viewBoxBuffer,
                       Math.max(minArrowBox,Math.abs(bbox.p2.x-bbox.p1.x) + viewBoxBuffer * 2),
                       Math.max(minArrowBox, Math.abs(bbox.p2.y-bbox.p1.y) + viewBoxBuffer * 2)];
      const renderedSvg = sticker.renderSvg([
        {
          el: line,
          x: bbox.p1.x + opts.lineStartOffset.x - viewBoxBuffer,
          y: bbox.p1.y + opts.lineStartOffset.y - viewBoxBuffer,
          width: viewBox[2],
          height: viewBox[3],
          color: color,
          viewBox: viewBox.join(' '),
          usesArrow: opts.usesArrow,
          arrowHeadRecord: arrowHeadRecord,
          arrowHeadSize: opts.arrowHeadSize
        }
      ]);

//      console.log('bbox:', bbox, 'finalCoordSpaceEndpoints', finalCoordSpaceEndpoints, 'viewBox', viewBox, 'pathPart:', pathPart);
      return renderedSvg;
    },

    makeEllipse: (opts) => {
      const dimensions = opts.dimensions;
      const buffer = opts.buffer || 4;
      const viewBoxRaw = '0 0 ' + dimensions.width + ' ' + dimensions.height;
      const viewBox = sticker.makeBufferedViewBox({buffer:buffer, bufferAllSides: true, viewBox: viewBoxRaw });
      let shapeObj = { cx: dimensions.width / 2,
                       cy: dimensions.height / 2,
                       rx: Math.max(0, dimensions.width / 2 - opts.buffer),
                       ry: Math.max(0,dimensions.height / 2 - opts.buffer),
                       stroke: opts.color,
                       "stroke-width": opts.strokeWidth,
                       "fill-opacity":opts.fillOpacity,
                       fill: opts.color
      };
      sticker.interpretDashing(opts, shapeObj);

      const theEllipse = sticker.makeSvgElement('ellipse', shapeObj);
      const parmBlock = {          
        el: theEllipse,
        x: dimensions.x,
        y : dimensions.y,
        width: dimensions.width,
        height: dimensions.height,
        viewBox: viewBox
      };

      const renderedSvg = sticker.renderSvg([parmBlock]);
      return renderedSvg;
    },

    makeBullsEye: (opts) => {
      const dimensions = opts.dimensions;
      const buffer = opts.buffer || 4;
      const viewBoxRaw = '0 0 ' + dimensions.width + ' ' + dimensions.height;
      const viewBox = sticker.makeBufferedViewBox({buffer:buffer, bufferAllSides: true, viewBox: viewBoxRaw });
      let shapeHash, shapeObj, parmBlocks = [];
      const ringRadii = [1,   5,   9,  13,  17,   3,   7,  11,  15 ];
      const innerRingsColor = (opts.innerRingsColor !== undefined ? opts.innerRingsColor: opts.color);
      const strokes = [opts.color, opts.color, opts.color, opts.color, opts.color, 
                       innerRingsColor, innerRingsColor, innerRingsColor, innerRingsColor ];
      const fills = [opts.color, opts.color, opts.color, opts.color, opts.color, 
                     innerRingsColor, innerRingsColor, innerRingsColor, innerRingsColor ];                     
      for (let ringCtr = 0; ringCtr < ringRadii.length; ++ringCtr) {
        shapeHash = { cx: dimensions.width / 2,
                      cy: dimensions.height / 2,
                      rx: ringRadii[ringCtr],
                      ry: ringRadii[ringCtr],
                      stroke: strokes[ringCtr],
                      "stroke-width": opts.strokeWidth,
                      "fill-opacity": opts.fillOpacity,
                      fill: fills[ringCtr],
        };
        shapeObj = sticker.makeSvgElement('ellipse', shapeHash);
        parmBlocks.push({          
          el: shapeObj,
          x: dimensions.x,
          y : dimensions.y,
          width: dimensions.width,
          height: dimensions.height,
          viewBox: viewBox
        });
      }

      const renderedSvg = sticker.renderSvg(parmBlocks);
      return renderedSvg;

    },

    makeBufferedViewBox: (opts) => {
      const doubleBuffer = opts.buffer * 2;
      let bufferedViewBox;
      let viewBox;
      if (typeof(opts.viewBox) === 'string') {
        viewBox = opts.viewBox.split(' ');
      } else {
        viewBox = opts.viewBox;
      }
      if (opts.bufferAllSides) {
        bufferedViewBox = [
          parseInt(viewBox[0]) - opts.buffer,
          parseInt(viewBox[1]) - opts.buffer,
          parseInt(viewBox[2]) + doubleBuffer,
          parseInt(viewBox[3]) + doubleBuffer
        ];
      } else {
        bufferedViewBox = [
          parseInt(viewBox[0]),
          parseInt(viewBox[1]),
          parseInt(viewBox[2]) + doubleBuffer,
          parseInt(viewBox[3]) + doubleBuffer
        ];
      }
      return bufferedViewBox.join(' ');
    },

    makeSimplePath: (opts) => {
      const buffer = (opts.buffer === undefined ?  4 : opts.buffer);
      const doubleBuffer = buffer * 2;
      const viewBox = sticker.makeBufferedViewBox({buffer:buffer, bufferAllSides: true, viewBox: opts.viewBox });
      const color = (opts.color === undefined ? '#000' : opts.color);
      const strokeWidth = (opts.strokeWidth === undefined ? 3 : opts.strokeWidth);
      const outerClass = (opts.outerClass === undefined ? 'graffiti-sticker-inner' : opts.outerClass);
      let pathObj, thePath, parmBlock;
      let renderParms = [];
      for (let dRec of opts.d) {
        pathObj = 
          {
            'vector-effect': 'non-scaling-stroke',
            'stroke-width' : strokeWidth,
            stroke: color,
            d: dRec,
          };

        if (opts.fill !== undefined) {
          pathObj.fill = opts.fill;
        } else {
          pathObj['fill-opacity'] = 0;
        }

        if (opts.transform !== undefined) {
          pathObj.transform = opts.transform;
        }

        if (opts.fillOpacity !== undefined) {
          pathObj['fill-opacity'] = opts.fillOpacity;
          pathObj.fill = opts.color;
        }

        sticker.interpretDashing(opts, pathObj);

        thePath = sticker.makeSvgElement('path',pathObj);
        parmBlock = {          
          el: thePath,
          x: opts.dimensions.x - buffer,
          y : opts.dimensions.y - buffer,
          width: opts.dimensions.width + doubleBuffer,
          height: opts.dimensions.height + doubleBuffer,
          outerClass: outerClass,
          title: opts.title,
          viewBox: viewBox,
        };
        if (opts.cssTransform !== undefined) {
          parmBlock.cssTransform = opts.cssTransform;
        }
        if (opts.metaTag !== undefined) {
          parmBlock.metaTag = opts.metaTag;
        }
        renderParms.push(parmBlock);
      }
      const renderedSvg = sticker.renderSvg(renderParms);
      return renderedSvg;
    },

    makeRightCurlyBracePath: (opts) => {
      let pathObj = {
        stroke: opts.color,
        "stroke-width": opts.strokeWidth,
        "vector-effect": "non-scaling-stroke",
        "stroke-width" : "3",
        "fill-opacity": 0,
        d: "M0,0 A100, 173.20508075688772 0 0 1  100, 173.20508075688772 A100, " +
           "173.20508075688772 0 0 0 200 346.41016151377545 A100, " +
           "173.20508075688772 0 0 0 100, 519.6152422706632 A100, " +
           "173.20508075688772 0 0 1 0, 692.8203230275509"
      };
      sticker.interpretDashing(opts, pathObj);
      const  rightCurlyBracePath = sticker.makeSvgElement('path', pathObj);
      return rightCurlyBracePath;
    },

    makeLeftCurlyBrace: (opts) => {
      const curlyViewBox = '0 0 200 692';
      const curlyBracePath = sticker.makeRightCurlyBracePath({ 
        dashed: opts.dashed,
        color: opts.color,
        strokeWidth: opts.strokeWidth
      });
      const renderedSvg = sticker.renderSvg([
        {
          el: curlyBracePath,
          width: 8,
          height: opts.dimensions.height,
          viewBox: curlyViewBox,
          x: opts.dimensions.x,
          y: opts.dimensions.y,
          cssTransform: "scaleX(-1)" // css transform
        }
      ]);
      return renderedSvg;
    },

    makeRightCurlyBrace: (opts) => {
      const curlyViewBox = '0 0 200 692';
      const curlyBracePath = sticker.makeRightCurlyBracePath({ 
        dashed: opts.dashed,
        color: opts.color,
        strokeWidth: opts.strokeWidth
      });
      const renderedSvg = sticker.renderSvg([
        {
          el: curlyBracePath,
          width: 8,
          height: opts.dimensions.height,
          viewBox: curlyViewBox,
          x: opts.dimensions.x,
          y: opts.dimensions.y
        }
      ]);
      return renderedSvg;
    },

    makeSymmetricCurlyBraces: (opts) => {
      const curlyViewBox = '0 0 200 692';
      const curlyBracePath1 = sticker.makeRightCurlyBracePath({ 
        dashed: opts.dashed,
        color: opts.color,
        strokeWidth: opts.strokeWidth
      });
      const curlyBracePath2 = sticker.makeRightCurlyBracePath({ 
        dashed: opts.dashed,
        color: opts.color,
        strokeWidth: opts.strokeWidth
      });
      const renderedSvg = sticker.renderSvg([
        {
          el: curlyBracePath1,
          width: 8,
          height: opts.dimensions.height,
          viewBox: curlyViewBox,
          x: opts.dimensions.x - 1,
          y : opts.dimensions.y,
          cssTransform: "scaleX(-1)" // css transform
        },
        {
          el: curlyBracePath2,
          width: 8,
          height: opts.dimensions.height,
          viewBox: curlyViewBox,
          x: opts.dimensions.x + opts.dimensions.width - 8 + 1,
          y : opts.dimensions.y,
          dashed: opts.dashed,
          color:opts.color,
          strokeWidth: opts.strokeWidth
        }
      ]);
      //console.log(renderedSvg);
      return renderedSvg;
    },


    makeTopBracket: (opts) => {
      const width = opts.dimensions.width;
      const height = opts.dimensions.height;
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          buffer:0,
          viewBox: [0,0,width,height],
          d: ['M 0 ' + height + ' L 0 0 L ' + width + ' 0 L ' + width + ' ' + height]
        })
      );
    },

    makeBottomBracket: (opts) => {
      const width = opts.dimensions.width;
      const height = opts.dimensions.height;
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          viewBox: [0,0,width,height],
          d: ['M 0 0 L 0 ' + height + ' L ' + width + ' ' + height + ' L ' + width + '0']
        })
      );
    },

    makeLeftBracket: (opts) => {
      const width = opts.dimensions.width;
      const height = opts.dimensions.height;
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          buffer:0,
          viewBox: [0,0,width,height],
          d: ['M ' + width + ' ' + height + ' L 0 ' + height + ' L 0 0 L ' + width + ' 0']
        })
      );
    },

    makeRightBracket: (opts) => {
      const width = opts.dimensions.width;
      const height = opts.dimensions.height;
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          buffer:0,
          viewBox: [0,0,width,height],
          d: ['M 0 0 L ' + width + ' 0 L ' + width + ' ' + height + ' L 0 ' + height]
        })
      );
    },

    makeHorizontalBrackets: (opts) => {
      const width = opts.dimensions.width;
      const height = opts.dimensions.height;
      const bracketHeight1 = Math.min(sticker.minBracketWidth, parseInt(height / 10));
      const bracketHeight2 = Math.max(height - sticker.minBracketWidth, height - parseInt(height / 10));
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          buffer:0,
          viewBox: [0,0,width,height],
          d: ['M 0 ' + bracketHeight1 + ' L 0 0 L ' + width + ' 0 L ' + width + ' ' + bracketHeight1,
              'M 0 ' + bracketHeight2 + ' L 0 ' + height + ' L ' + width + ' ' + height + ' L ' + width + ' ' + bracketHeight2]
        })
      );
    },

    makeVerticalBrackets: (opts) => {
      const width = opts.dimensions.width;
      const height = opts.dimensions.height;
      const bracketWidth1 = Math.min(sticker.minBracketWidth, parseInt(width / 10));
      const bracketWidth2 = Math.max(width - sticker.minBracketWidth, width - parseInt(width / 10));
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          viewBox: [0,0,width,height],
          d: ['M ' + bracketWidth1 + ' 0 L 0 0 L 0 ' + height + ' L ' + bracketWidth1 + ' ' + height,
              'M ' + bracketWidth2 + ' 0 L ' + width + ' 0 L ' + width + ' ' + height + ' L ' + bracketWidth2 + ' ' + height]
        })
      );
    },

    makeRectangle: (opts) => {
      const dimensions = opts.dimensions;
      const buffer = opts.buffer || 4;
      const viewBoxRaw = '0 0 ' + dimensions.width + ' ' + dimensions.height;
      const viewBox = sticker.makeBufferedViewBox({buffer:buffer, bufferAllSides: true, viewBox: viewBoxRaw });
      let shapeObj = { x: 0,
                       y: 0, 
                       width: dimensions.width,
                       height: dimensions.height,
                       stroke: opts.color,
                       fill: opts.color,
                       "stroke-width": opts.strokeWidth,
                       "fill-opacity":opts.fillOpacity
      };
      sticker.interpretDashing(opts, shapeObj);
      if (opts.rx !== undefined) { // check for roundrect
        shapeObj.rx = opts.rx;
        shapeObj.ry = opts.ry;
      }
      const theRect = sticker.makeSvgElement('rect', shapeObj);
      const parmBlock = {          
        el: theRect,
        x: dimensions.x,
        y : dimensions.y,
        width: dimensions.width,
        height: dimensions.height,
        viewBox: viewBox
      };

      const renderedSvg = sticker.renderSvg([parmBlock]);
      return renderedSvg;
    },

    makeRightTriangle: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          viewBox: [0, 0, 100, 125],
          d: ["M 0 125 L 100 125 L 0 0 Z"]
        })
      );
    },

    makeIsocelesTriangle: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          viewBox: [0, 0, 100, 125],
          d: ["M 0 125 L 100 125 L 50 0 Z"],
        })
      );
    },

    makeTheta: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          viewBox: [0, 0, 469, 700],
          d: ["M469 334c-2,440 -453,468 -469,2 -13,-435 472,-460 469,-2zm-383 -20l298 0c-9,-366 -288,-376 -298,-6l0 6zm297 46l-297 0c16,345 279,397 297,11 0,-4 0,-7 0,-11z"],
          fill: opts.color
        })
      );
    },

    makeSigma: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 16, 16],
          d: ['M2,1l5.46,7.27L2,15h12v-4h-1v1c0,0.552-0.448,1-1,1H4.97l4.39-5.52L5.25,2H12c0.552,0,1,0.448,1,1v1h1V1H2z'],
          fill: opts.color
        })
      );
    },

    makeSmiley: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 49, 49],
          d: ['M25,1A24,24,0,1,0,49,25,24,24,0,0,0,25,1Zm0,46A22,22,0,1,1,47,25,22,22,0,0,1,25,47ZM35.77,33.32a1,1,0,0,1-.13,1.41C31.73,38,28.06,39.1,24.9,39.1a16,16,0,0,1-10.63-4.45,1,1,0,0,1,1.45-1.38c0.34,0.35,8.35,8.52,18.63-.08A1,1,0,0,1,35.77,33.32ZM15,19a3,3,0,1,1,3,3A3,3,0,0,1,15,19Zm14,0a3,3,0,1,1,3,3A3,3,0,0,1,29,19Z'],
          fill: opts.color
        })
      );
    },

    makeFrowney: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 100, 125],
          d: ['M50,2.5C23.809,2.5,2.5,23.809,2.5,50S23.809,97.5,50,97.5S97.5,76.191,97.5,50S76.191,2.5,50,2.5z M50,91.684    C27.016,91.684,8.316,72.984,8.316,50S27.016,8.316,50,8.316S91.684,27.016,91.684,50S72.984,91.684,50,91.684z M37.489,41.386    c2.964,0,5.369-2.403,5.369-5.369c0-2.966-2.405-5.368-5.369-5.368c-2.966,0-5.369,2.402-5.369,5.368    C32.12,38.982,34.523,41.386,37.489,41.386z M62.511,41.386c2.965,0,5.369-2.403,5.369-5.369c0-2.966-2.404-5.368-5.369-5.368    c-2.966,0-5.368,2.402-5.368,5.368C57.143,38.982,59.545,41.386,62.511,41.386z M50.001,51.186    c-13.939,0-20.525,9.548-22.06,14.597c-0.467,1.537,0.399,3.161,1.936,3.628c1.539,0.471,3.161-0.399,3.628-1.936    c0.032-0.105,3.336-10.473,16.496-10.473c13.015,0,16.363,10.061,16.494,10.472c0.381,1.255,1.534,2.063,2.781,2.063    c0.28,0,0.564-0.04,0.846-0.127c1.538-0.467,2.405-2.091,1.938-3.627C70.524,60.733,63.939,51.186,50.001,51.186z'],
        })
      );
    },

    makeThumbsUp: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 218, 346.25],
          d: ['M28 263l31 -9c64,42 77,13 92,10 4,0 1,4 17,0 22,-7 31,-19 23,-35 19,-6 21,-18 15,-33 15,-9 15,-26 3,-38 19,-37 -11,-67 -80,-48 -5,-36 11,-59 5,-80 -7,-27 -25,-31 -50,-30 3,68 8,35 -25,101 -27,55 -3,48 -57,63 -6,36 4,70 26,99zm4 -12c-16,-24 -23,-49 -21,-77 48,-14 33,-15 57,-65 33,-71 31,-34 27,-97 31,1 32,26 26,50 -7,27 -6,40 -1,62 26,-7 74,-21 82,6 7,27 -22,40 -35,41l-42 -7c9,-28 36,-19 44,-19l10 -3 7 -13c-29,8 -10,3 -31,4 -24,1 -40,15 -43,40l8 1c-8,7 -13,16 -14,28l9 1c-5,6 -10,15 -12,26l14 3c-5,7 -9,15 -11,26l29 4c-29,10 -50,-1 -74,-20l-29 9zm87 -58c12,-30 27,-10 49,-12 5,0 27,-7 33,-14 24,20 -36,32 -39,33l-43 -7zm-2 27l10 -15c44,7 28,8 70,-4 10,19 -35,26 -35,26l-45 -7zm3 30l9 -17c36,5 26,7 53,0 4,16 -17,22 -23,22l-39 -5z'],
          fill: opts.color
        })
      );
    },

    makeThumbsDown: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 226, 357.5],
          d: ['M18 27l33 4c59,-51 77,-23 92,-23 5,0 0,-4 18,-2 23,3 33,15 28,32 20,4 24,15 20,32 17,7 19,23 8,37 25,36 -1,70 -74,60 0,38 19,59 16,82 -3,27 -21,34 -46,37 -6,-70 3,-37 -40,-99 -35,-52 -10,-48 -67,-56 -11,-36 -6,-71 12,-104zm6 12c-13,26 -16,53 -10,81 51,7 35,11 67,58 44,66 36,29 41,95 32,-7 29,-32 19,-55 -11,-27 -11,-40 -9,-63 27,4 78,10 82,-18 4,-28 -28,-37 -41,-36l-42 13c13,27 39,14 48,13l10 1 9 12c-30,-4 -10,-1 -33,1 -23,2 -41,-9 -49,-34l8 -3c-8,-6 -15,-14 -18,-26l9 -3c-6,-5 -11,-13 -16,-24l15 -5c-7,-6 -12,-15 -15,-25l28 -8c-30,-7 -50,8 -72,30l-31 -4zm96 46c17,28 30,7 52,5 6,-1 29,4 36,9 21,-23 -42,-27 -44,-27l-44 13zm-5 -27l12 14c44,-13 27,-12 72,-6 7,-21 -39,-22 -40,-22l-44 14zm-1 -31l11 16c36,-11 26,-11 54,-7 2,-18 -20,-20 -27,-20l-38 11z'],
          fill: opts.color
        })
      );
    },


    makeStar: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 1024, 1280],
          d: ['M521.19122173 257.59668148l48.67463902 112.36592198c10.61521383 24.46677333 33.65799506 41.42522469 60.32548344 44.14375505l123.62840495 12.55702124-92.30057877 79.48464988c-20.71261235 17.86462815-29.90383408 45.43829333-23.8195042 72.10578173l27.44421136 121.68659752-105.37541531-64.20909827c-11.52139061-6.99050667-24.85513482-10.74466765-38.31833283-10.74466765-13.59265185 0-26.79694222 3.75416098-38.31833286 10.74466765l-105.37541529 64.20909827 27.44421135-121.68659752c5.95487605-26.66748839-3.10689185-54.24115358-23.8195042-72.10578173l-92.30057876-79.48464988 123.62840494-12.55702124c26.53803457-2.71853037 49.71026963-19.5475279 60.32548346-44.14375505l48.1568237-112.36592198m0-117.80298272c-6.2137837 0-12.55702124 3.3657995-15.40500543 10.09739852l-85.43952593 197.28763258c-2.45962272 5.56651457-7.63777581 9.45012939-13.72210568 10.09739853l-216.446799 22.00715063c-14.7577363 1.55344592-20.45370469 19.80643555-9.32067556 29.51547258l163.11182222 140.45740248c4.66033778 4.01306864 6.86105283 10.35630617 5.43706074 16.44063605l-48.1568237 213.98717629c-2.58907653 11.26248297 6.34323753 20.58315852 16.44063604 20.58315852 2.84798419 0 5.95487605-0.77672297 8.67340642-2.45962272l186.15460346-113.40155259c2.71853037-1.68289975 5.69596839-2.45962272 8.80286024-2.45962272s6.08432987 0.77672297 8.80286026 2.45962272l186.15460344 113.40155259c2.84798419 1.68289975 5.82542222 2.45962272 8.67340644 2.45962272 10.09739852 0 19.02971259-9.32067555 16.44063604-20.58315852L693.23535803 565.69679013c-1.4239921-6.08432987 0.77672297-12.42756741 5.43706073-16.44063605l163.11182222-140.45740248c11.26248297-9.70903703 5.43706075-27.96202667-9.32067555-29.51547258l-216.44679901-22.00715063c-6.08432987-0.64726914-11.26248297-4.40143013-13.72210567-10.09739853l-85.43952593-197.28763258c-3.23634569-6.73159902-9.45012939-10.09739852-15.66391309-10.09739852z'],
          fill: opts.color
        })
      );
    },

    makeRibbon: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: '0 0 100 100',
          d: ["M76.979,12.22c-0.366-0.579-1.004-0.93-1.689-0.93H59.165c-0.768,0-1.468,0.439-1.802,1.132l-6.634,13.76l-7.117-13.808  c-0.343-0.666-1.028-1.084-1.777-1.084H24.71c-0.686,0-1.323,0.351-1.689,0.93c-0.367,0.579-0.411,1.306-0.118,1.926l15.213,32.151  c-6.585,4.021-10.99,11.274-10.99,19.538C27.125,78.448,37.387,88.71,50,88.71s22.875-10.262,22.875-22.875  c0-8.264-4.405-15.518-10.99-19.538l15.213-32.151C77.391,13.525,77.347,12.799,76.979,12.22z M27.869,15.29h12.747l14.572,28.271  C53.521,43.172,51.785,42.96,50,42.96c-2.927,0-5.724,0.559-8.299,1.564L27.869,15.29z M68.875,65.835  c0,10.407-8.468,18.875-18.875,18.875s-18.875-8.468-18.875-18.875S39.593,46.96,50,46.96S68.875,55.428,68.875,65.835z   M59.201,42.617l-6.178-11.984l7.397-15.343h11.71L59.201,42.617z M48.207,53.277l-2.999,6.074l-6.703,0.973  c-0.754,0.109-1.38,0.638-1.615,1.361s-0.039,1.519,0.506,2.051l4.852,4.728l-1.146,6.677c-0.128,0.75,0.181,1.509,0.796,1.956  c0.349,0.253,0.762,0.382,1.176,0.382c0.318,0,0.638-0.076,0.931-0.229L50,74.098l5.994,3.151c0.675,0.353,1.491,0.295,2.106-0.152  s0.924-1.206,0.796-1.956l-1.145-6.677l4.852-4.728c0.545-0.532,0.741-1.327,0.506-2.051s-0.861-1.252-1.615-1.361l-6.703-0.973  l-2.997-6.074c-0.337-0.683-1.032-1.115-1.794-1.115C49.239,52.162,48.544,52.595,48.207,53.277z M51.669,62.064  c0.292,0.591,0.855,1,1.507,1.095l3.732,0.542l-2.7,2.632c-0.472,0.46-0.687,1.122-0.576,1.771l0.638,3.72l-3.339-1.756  c-0.582-0.307-1.279-0.307-1.861,0l-3.34,1.756l0.638-3.72c0.11-0.648-0.104-1.311-0.575-1.771l-2.701-2.632l3.732-0.542  c0.651-0.095,1.215-0.504,1.506-1.095L50,58.682L51.669,62.064z"],
          fill: opts.color
        })
      );
    },
    
    makeAxis: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: opts.strokeWidth,
          viewBox: '0 0 90 90',
          d:["M89.7,85.7c0,0.2-0.1,0.3-0.2,0.4l-3.2,2.2c-0.1,0.1-0.2,0.1-0.3,0.1c-0.1,0-0.2,0-0.2-0.1c-0.2-0.1-0.3-0.3-0.3-0.4v-1.2  H13c-0.6,0-1-0.4-1-1V15.8h-1.2c-0.2,0-0.4-0.1-0.4-0.3c-0.1-0.2-0.1-0.4,0-0.5l2.2-3.2c0.2-0.3,0.6-0.3,0.8,0l2.2,3.2  c0.1,0.2,0.1,0.4,0,0.5c-0.1,0.2-0.3,0.3-0.4,0.3H14v68.9h71.4v-1.2c0-0.2,0.1-0.4,0.3-0.4c0.2-0.1,0.4-0.1,0.5,0l3.2,2.2  C89.6,85.4,89.7,85.6,89.7,85.7z"],
          fill: 'solid',
        })
      );
    },

    makeBomb: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: opts.strokeWidth,
          viewBox: '0 0 100 100',
          d:["M44.5,44.4v-3.9c0-1.1-0.9-2-2-2h-5.6c0-2.2,0.3-5.1,1.8-6.9c1.1-1.3,2.6-1.9,4.7-1.9c3.1,0,6.1,1.2,8.9,2.3  c5.4,2.2,11.1,4.4,16.9-1.6c0.6-0.6,0.6-1.5,0-2.1c-0.6-0.6-1.5-0.6-2.1,0c-4.4,4.6-8.5,3-13.6,0.9c-3.1-1.3-6.4-2.6-10-2.6  c-3,0-5.3,1-7,3c-2.2,2.6-2.5,6.3-2.5,8.8h-5.1c-1.1,0-2,0.9-2,2v3.9C18.3,47.9,12.3,56.3,12.3,66c0,12.9,10.4,23.3,23.3,23.3  S59,78.9,59,66C59,56.3,53,47.9,44.5,44.4z M32.9,80.3c-0.2,0.6-0.8,1.1-1.4,1.1c-0.1,0-0.3,0-0.4-0.1c-6.8-2-11.3-8.2-11.3-15.3  c0-3.5,1.1-6.9,3.3-9.7c0.5-0.7,1.4-0.8,2.1-0.3c0.7,0.5,0.8,1.4,0.3,2.1c-1.7,2.3-2.7,5-2.7,7.9c0,5.7,3.8,10.8,9.2,12.4  C32.7,78.6,33.2,79.5,32.9,80.3z",
             "M82.3,14.5c0.5-0.6,0.5-1.6-0.2-2.1c-0.6-0.5-1.6-0.5-2.1,0.2l-8.6,10.1c-0.5,0.6-0.5,1.6,0.2,2.1c0.3,0.2,0.6,0.4,1,0.4  c0.4,0,0.8-0.2,1.1-0.5L82.3,14.5z",
             "M60.7,13.9C60.7,13.9,60.7,13.9,60.7,13.9l3.9,8.7c0,0,0,0,0,0l0.5,1.1c0.3,0.6,0.8,0.9,1.4,0.9c0.2,0,0.4,0,0.6-0.1  c0.8-0.3,1.1-1.2,0.7-2l-0.5-1.1c0,0,0,0,0,0l-3.9-8.7c0,0,0,0,0,0l-0.5-1.1c-0.3-0.8-1.2-1.1-2-0.7c-0.8,0.3-1.1,1.2-0.7,2  L60.7,13.9z",
             "M75.5,32.4c-0.6-0.6-1.6-0.5-2.1,0.1c-0.6,0.6-0.5,1.6,0.1,2.1l9.7,9.2c0.3,0.3,0.7,0.4,1,0.4c0.4,0,0.8-0.2,1.1-0.5  c0.6-0.6,0.5-1.6-0.1-2.1L75.5,32.4z",
             "M86.2,26.6l-10.5,0c-0.8,0-1.5,0.7-1.5,1.5c0,0.8,0.7,1.5,1.5,1.5l10.5,0c0.8,0,1.5-0.7,1.5-1.5  C87.7,27.3,87,26.6,86.2,26.6z",
             "M50.9,21.7l11.6,5.4c0.2,0.1,0.4,0.1,0.6,0.1c0.6,0,1.1-0.3,1.4-0.9c0.4-0.8,0-1.6-0.7-2L52.2,19c-0.7-0.4-1.6,0-2,0.7  C49.9,20.5,50.2,21.3,50.9,21.7z",
             "M69.5,34.8c-0.8,0-1.5,0.7-1.5,1.5l0,11.3c0,0.8,0.7,1.5,1.5,1.5c0.8,0,1.5-0.7,1.5-1.5l0-11.3C71,35.4,70.4,34.8,69.5,34.8  z"
          ],
          fill: opts.color
        })
      );
    },
    
    makeCheckmark: (opts) => {
      let dimensions;
      if (opts.iconUsage) {
        dimensions = $.extend({}, opts.dimensions);
      } else {
        dimensions = { x: opts.dimensions.x, 
                       y: opts.dimensions.y,
                       width:  Math.max(opts.dimensions.width, 25),
                       height: Math.max(opts.dimensions.height, 25)
        };
      }
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: opts.strokeWidth,
          viewBox: '0 0 587 783.75',
          d:["M0 303c61,65 122,129 184,194 134,-166 227,-376 403,-497 -181,160 -285,402 -400,627 -62,-108 -125,-216 -187,-324z"],
          color:'#090',
          fill:'#4f4',
          dimensions:dimensions,
          dashed:undefined
        })
      );
    },

    makeXmark: (opts) => {
      let dimensions, strokeWidth;
      if (opts.iconUsage) {
        dimensions = $.extend({}, opts.dimensions);
        strokeWidth = opts.strokeWidth;
      } else {
        strokeWidth = 5;
        dimensions = { x: opts.dimensions.x, 
                       y: opts.dimensions.y,
                       width:  Math.max(opts.dimensions.width, 25),
                       height:  Math.max(opts.dimensions.height, 25)
        };
      }
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: strokeWidth,
          viewBox: '0 0 100 100',
          d:["M10 10 L 80 80 M 80 10 L 10 80"],
          color: 'red',
          dimensions: dimensions,
          dashed: undefined
        })
      );
    },

    makePi: (opts) => {
      let dimensions, strokeWidth;
      if (opts.iconUsage) {
        dimensions = $.extend({}, opts.dimensions);
        strokeWidth = opts.strokeWidth;
      } else {
        strokeWidth = 1;
        dimensions = { x: opts.dimensions.x, 
                       y: opts.dimensions.y,
                       width:  Math.max(opts.dimensions.width, 25)
        };
        dimensions.height = dimensions.width;
      }
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: strokeWidth,
          viewBox: '0 0 110 137.5',
          d:["M21.33,40.487h-3.057c0,0,2.938-21.636,19.974-21.636s53.479,0,53.479,0v11.337H74.157c0,0-3.265,22.259-3.265,34.25  c0,11.989,7.242,14.363,10.091,14.363s7.479-5.46,7.479-6.528c0-1.069,0-2.612,0-2.612h3.265c0,0-1.009,21.487-15.848,21.487  c-14.84,0-13.415-24.93-13.296-25.761c0.118-0.831,3.087-35.021,3.087-35.021H47.15c0,0-0.514,26.395-2.256,34.151  c-1.741,7.756-3.481,26.631-13.139,26.631c-9.654,0-6.171-8.586-6.013-9.379c0.157-0.791,7.122-10.289,8.705-14.72  c1.582-4.432,3.799-36.723,3.799-36.723s-9.676-1.613-13.296,4.273C21.33,40.487,21.33,40.487,21.33,40.487z"],
          color: opts.color,
          fill: opts.color,
          dimensions: dimensions,
          dashed: undefined
        })
      );
    },

    makeAlpha: (opts) => {
      let dimensions, strokeWidth;
      if (opts.iconUsage) {
        dimensions = $.extend({}, opts.dimensions);
        strokeWidth = opts.strokeWidth;
      } else {
        strokeWidth = 1;
        dimensions = { x: opts.dimensions.x, 
                       y: opts.dimensions.y,
                       width:  Math.max(opts.dimensions.width, 25)
        };
        dimensions.height = dimensions.width;
      }
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: strokeWidth,
          viewBox: '0 0 1000 1250',
          d:["M893 755c14,-17 39,-19 56,-5 17,15 19,40 4,57 -181,211 -273,23 -329,-153 -254,411 -603,196 -586,-174 16,-346 418,-629 607,-33 47,-101 88,-205 131,-308 9,-20 32,-30 52,-22 21,9 30,32 22,53 -54,130 -106,263 -172,388 37,123 74,361 215,197zm-300 -204c-166,-554 -461,-392 -476,-68 -15,337 264,458 476,68z"],
          color: opts.color,
          fill: opts.color,
          dimensions: dimensions,
          dashed: undefined
        })
      );
    },

    makeBeta: (opts) => {
      let dimensions, strokeWidth;
      if (opts.iconUsage) {
        dimensions = $.extend({}, opts.dimensions);
        strokeWidth = opts.strokeWidth;
      } else {
        strokeWidth = 1;
        dimensions = { x: opts.dimensions.x, 
                       y: opts.dimensions.y,
                       width:  Math.max(opts.dimensions.width, 25)
        };
        dimensions.height = dimensions.width;
      }
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: strokeWidth,
          viewBox: '0 0 1000 1250',
          d:["M291 982c-15,8 -33,2 -40,-13 -8,-14 -3,-32 12,-40 64,-34 46,-199 28,-374 -13,-118 -26,-241 -14,-338 16,-131 74,-218 227,-200 10,2 21,4 32,8 32,11 64,34 86,66 23,33 35,75 29,126 -2,16 -6,33 -12,51 -6,15 -12,30 -20,44 23,10 44,26 63,46 28,31 50,73 61,118 12,45 14,93 2,137 -28,111 -133,196 -358,138 -10,-2 -17,-9 -21,-18 5,118 -8,213 -75,249zm61 -448c6,56 12,112 15,164 5,-15 21,-24 36,-20 182,46 265,-14 286,-95 9,-34 8,-72 -2,-108 -9,-35 -25,-68 -47,-92 -17,-17 -36,-30 -58,-34 -12,13 -24,23 -36,32 -15,11 -29,18 -42,22 -19,5 -36,4 -50,-6 -8,-6 -15,-15 -18,-27 -3,-11 1,-23 9,-30l0 0c38,-35 76,-52 112,-55 11,-15 21,-33 27,-52 5,-14 8,-27 10,-39 4,-34 -4,-63 -19,-84 -15,-21 -36,-36 -57,-44 -7,-2 -13,-4 -20,-4 -107,-14 -148,50 -160,147 -11,91 2,210 14,325z"],
          color: opts.color,
          fill: opts.color,
          dimensions: dimensions,
          dashed: undefined
        })
      );
    },

    makeGrid: (opts) => {
      let dimensions, strokeWidth;
      if (opts.iconUsage) {
        dimensions = $.extend({}, opts.dimensions);
        strokeWidth = opts.strokeWidth;
      } else {
        strokeWidth = 1;
        dimensions = { x: opts.dimensions.x, 
                       y: opts.dimensions.y,
                       width:  Math.max(opts.dimensions.width, 25)
        };
        dimensions.height = dimensions.width;
      }
      const numGridLines = 10;
      const viewBoxSize = 100;
      const gridInc = viewBoxSize / numGridLines;
      const viewBox = sticker.makeBufferedViewBox({buffer:5, viewBox: [0,0,viewBoxSize,viewBoxSize]});
      let gridCtr, gridVal, d = '';
      for (gridCtr = 0; gridCtr <= numGridLines; ++gridCtr) {
        gridVal = gridCtr * gridInc;
        d += 'M 0 ' + gridVal + ' ' + 'L ' + viewBoxSize + ' ' + gridVal + ' ';
        d += 'M ' + gridVal + ' 0 ' + 'L ' + gridVal + ' ' + viewBoxSize + ' ';
      }

      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: strokeWidth,
          viewBox: viewBox,
          d:[d],
          dimensions: dimensions,
          dashed: undefined
        })
      );
    },

    makeRightSideMarker: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 100, 50],
          d: ["M 0 25 L 25 0 L 100 0 L 100 50 L 25 50 Z"], 
          fill: opts.color,
          outerClass: 'graffiti-right-side-marker',
          buffer: 0,
        })
      );
    },


    makeAngle: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 30, 35],
          transform: "translate(-390 -560)",
          d: ["M401.883,578.324l12.971-12.971l-0.707-0.707L390.793,588H419v-1h-13.524    C405.357,583.749,404.098,580.706,401.883,578.324z M393.207,587l7.969-7.969c2.026,2.192,3.183,4.984,3.3,7.969H393.207z"],
          fill: opts.color,
        })
      );
    },

    makeTrophy: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 2,
          viewBox: [0, 0, 100, 125],
          d: ["M69.402,82.288H30.598c-0.855,0-1.548,0.692-1.548,1.548v8.462c0,0.857,0.693,1.55,1.548,1.55h38.804  c0.854,0,1.549-0.693,1.549-1.55v-8.462C70.951,82.98,70.258,82.288,69.402,82.288z",
              "M93.357,15.879c-1.635-2.293-5.112-4.738-12.479-4.309c0.062-1.208,0.104-2.446,0.123-3.716  c0.017-0.94-0.681-1.703-1.537-1.703H20.536c-0.856,0-1.551,0.762-1.537,1.703c0.019,1.271,0.061,2.508,0.123,3.717  c-7.363-0.43-10.845,2.013-12.479,4.307c-2.331,3.271-2.174,8,0.428,12.978c3.722,7.119,12.165,14.247,22.486,16.61  C36.188,54.68,43.49,57.225,43.49,57.225h13.021c0,0,7.301-2.545,13.934-11.759c10.32-2.365,18.764-9.492,22.486-16.61  C95.532,23.88,95.688,19.15,93.357,15.879z M11.381,26.603c-1.723-3.295-2.007-6.175-0.778-7.9c1.311-1.838,4.444-2.606,8.914-2.228  c1.002,9.551,3.36,16.971,6.236,22.688C19.17,36.406,13.945,31.507,11.381,26.603z M63.782,24.541l-6.49,6.326l1.532,8.933  c0.105,0.611-0.256,0.872-0.803,0.584L50,36.166l-8.023,4.218c-0.547,0.288-0.907,0.026-0.803-0.584l1.533-8.933l-6.49-6.326  c-0.444-0.433-0.306-0.856,0.307-0.945l8.968-1.303l4.011-8.129c0.274-0.556,0.719-0.556,0.993,0l4.011,8.129l8.968,1.303  C64.088,23.685,64.227,24.109,63.782,24.541z M88.619,26.603c-2.564,4.904-7.789,9.804-14.372,12.561  c2.876-5.717,5.233-13.137,6.235-22.688c4.472-0.379,7.604,0.39,8.914,2.228C90.626,20.428,90.342,23.308,88.619,26.603z",
              "M61.506,78.811c-6.724-9.961-5.283-18.379-5.283-18.379H43.777c0,0,1.44,8.418-5.284,18.379H61.506z"
          ],
          fill: opts.color,
        })
      );
    },
    
    makeButtonWithCursor: (fill) => {
      const buttonWithCursor = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 128 120" enable-background="new 0 0 128 128" xml:space="preserve"><path d="M120,28H8c-4.4,0-8,3.6-8,8v32c0,4.4,3.6,8,8,8h81.264l-0.955-4H8c-2.206,0-4-1.794-4-4V36c0-2.206,1.794-4,4-4h112  c2.206,0,4,1.794,4,4v32c0,1.907-1.343,3.5-3.132,3.898l0.358,0.109c1.417,0.431,2.569,1.364,3.32,2.56  C126.629,73.119,128,70.714,128,68V36C128,31.6,124.4,28,120,28z"/><path d="M114.174,81.744l5.973-2.11c0.815-0.288,1.353-1.066,1.333-1.931c-0.019-0.863-0.591-1.617-1.417-1.868l-25.48-7.748  c-0.686-0.21-1.431-0.034-1.952,0.456c-0.522,0.491-0.741,1.225-0.575,1.922l5.773,24.184c0.192,0.805,0.86,1.408,1.681,1.518  c0.82,0.106,1.623-0.297,2.02-1.023l3.009-5.509l9.558,9.766c0.391,0.398,0.909,0.601,1.431,0.601c0.452,0,0.907-0.153,1.28-0.464  l6.476-5.4c0.429-0.357,0.688-0.878,0.716-1.436c0.028-0.557-0.178-1.101-0.567-1.5L114.174,81.744z M115.662,95.281l-10.156-10.377  c-0.379-0.387-0.896-0.601-1.43-0.601c-0.091,0-0.183,0.006-0.274,0.019c-0.628,0.087-1.177,0.467-1.48,1.022l-1.811,3.315  l-3.756-15.732l16.32,4.963l-3.189,1.127c-0.645,0.228-1.128,0.768-1.282,1.434c-0.154,0.665,0.041,1.363,0.519,1.852l9.934,10.148  L115.662,95.281z"/></svg>';
      return buttonWithCursor;
    },

    makeButton: (opts) => {
      const buttonHtml = '<div class="button-icon" style="width:' + opts.width + 'px;height:' + opts.height + 'px;">' + opts.contents + '</div>';
      return buttonHtml;
    },

    makeTerminal: (opts) => {
      const height = parseInt(opts.width * 0.9);
      const terminalHtml = '<div class="terminal-icon" style="width:' + opts.width + 'px;height:' + height + 'px;">' +
                           '&gt;_' +
                           '</div>';
      return terminalHtml;
    },

    makeLock: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 1,
          viewBox: [0, 0, 100, 100],
          d: ["M77.9,41.2h-0.3v-8.9c0-15-11.7-27.6-26.7-28.1c-15.5-0.5-28.3,12-28.3,27.5c0,1.2,1,2.1,2.1,2.1H33c0.9,0,1.7-0.7,1.7-1.7  c0-8.3,6.4-15.5,14.7-15.9c8.9-0.4,16.2,6.7,16.2,15.4v9.4H34.7h-12h-0.6c-4,0-7.3,3.2-7.3,7.3v40c0,4,3.2,7.2,7.2,7.2h55.8  c4,0,7.3-3.2,7.3-7.3v-40C85.1,44.5,81.9,41.2,77.9,41.2z M22.9,87.7v-7l5.5,7H22.9z M34.7,87.7L22.9,72.6v-2.9h4l14.1,18H34.7z   M47.3,87.7l-14.1-18h6.3l14.1,18H47.3z M60,87.7l-14.1-18h6.3l14.1,18H60z M77.1,87.7h-4.5l-14.1-18h6.3l12.3,15.7V87.7z   M77.1,77.3l-5.9-7.6h5.9V77.3z"],
          fill: opts.color,
        }));
    },

    makeSimpleX: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 1,
          viewBox: [0, 0, 100, 100],
          d: ["M75.1,7.3L50,32.3L24.9,7.3c-1.2-1.2-3.1-1.2-4.2,0L5.8,22.1L33,49.3L5.8,76.5l14.8,14.8c1.2,1.2,3.1,1.2,4.2,0L50,66.3  l25.1,25.1c1.2,1.2,3.1,1.2,4.2,0l14.8-14.8L67,49.3l27.2-27.2L79.3,7.3C78.1,6.1,76.2,6.1,75.1,7.3z"],
          fill: opts.color,
        }));
    },

    

    makeHidden: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          strokeWidth: 1,
          viewBox: [0, 0, 100, 100],
          d: ["M 8.9 46.05 Q 7.3 46.05 6.15 47.2 5 48.35 5 50 5 51.6 6.15 52.75 7.3 53.9 8.9 53.9 L 25.65 53.9 Q 27.3 53.9 28.45 52.75 29.6 51.6 29.6 50 29.6 48.35 28.45 47.2 27.3 46.05 25.65 46.05 L 8.9 46.05 M 37.05 68.5 Q 38.2 67.35 38.2 65.75 38.2 64.1 37.05 62.95 35.9 61.85 34.25 61.85 32.65 61.85 31.5 62.95 L 18.2 76.25 Q 17.05 77.4 17.05 79.05 17.05 80.65 18.2 81.8 19.35 82.95 20.95 82.95 22.6 82.95 23.75 81.8 L 37.05 68.5 M 52.75 71.55 Q 51.6 70.4 50 70.4 48.4 70.4 47.25 71.55 46.1 72.7 46.1 74.35 L 46.1 91.05 Q 46.1 92.7 47.25 93.85 48.4 95 50 95 51.6 95 52.75 93.85 53.9 92.7 53.9 91.05 L 53.9 74.35 Q 53.9 72.7 52.75 71.55 M 93.85 47.2 Q 92.7 46.05 91.1 46.05 L 74.35 46.05 Q 72.75 46.05 71.55 47.2 70.4 48.35 70.4 50 70.4 51.6 71.55 52.75 72.75 53.9 74.35 53.9 L 91.1 53.9 Q 92.7 53.9 93.85 52.75 95 51.6 95 50 95 48.35 93.85 47.2 M 81.8 81.8 Q 82.95 80.65 82.95 79.05 82.95 77.4 81.8 76.25 L 68.5 62.95 Q 67.4 61.85 65.75 61.85 64.1 61.85 62.95 62.95 61.85 64.1 61.85 65.75 61.85 67.35 62.95 68.5 L 76.3 81.8 Q 77.4 82.95 79.05 82.95 80.65 82.95 81.8 81.8 M 82.95 20.95 Q 82.95 19.3 81.8 18.15 80.65 17 79.05 17 77.4 17 76.3 18.15 L 62.95 31.45 Q 61.85 32.6 61.85 34.25 61.85 35.85 62.95 37 64.1 38.15 65.75 38.15 67.4 38.15 68.5 37 L 81.8 23.7 Q 82.95 22.55 82.95 20.95 M 53.9 8.9 Q 53.9 7.3 52.75 6.15 51.6 5 50 5 48.4 5 47.25 6.15 46.1 7.3 46.1 8.9 L 46.1 25.65 Q 46.1 27.25 47.25 28.4 48.4 29.55 50 29.55 51.6 29.55 52.75 28.4 53.9 27.25 53.9 25.65 L 53.9 8.9 M 23.75 18.15 Q 22.6 17 20.95 17 19.35 17 18.2 18.15 17.05 19.3 17.05 20.95 17.05 22.55 18.2 23.7 L 31.5 37 Q 32.65 38.15 34.25 38.15 35.9 38.15 37.05 37 38.2 35.85 38.2 34.25 38.2 32.6 37.05 31.45 L 23.75 18.15 Z"],
          fill: opts.color,
        }));
    },

    makeRunningMan: (fill) => {
      const runnerIcon = '<svg xmlns:x="http://ns.adobe.com/Extensibility/1.0/" xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" xmlns:graph="http://ns.adobe.com/Graphs/1.0/" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 100 85" style="enable-background:new 10 10 100 70;" xml:space="preserve"><switch><foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/" x="0" y="0" width="1" height="1"/><g i:extraneous="self"><g fill-rule="evenodd" fill="' + fill + '"><path d="M48.8,57.3c-0.8-0.5-1.4-1.2-1.8-2c-1.5,4.3-3.6,9.6-4.7,12.2c-2.9,0.1-9.5-0.6-14.9-1.5c-2.3-0.4-4.5,1.2-4.8,3.5     c-0.4,2.3,1.2,4.5,3.5,4.8c0.2,0,4.6,0.7,9.2,1.2c2.5,0.3,4.6,0.4,6.4,0.4c3.9,0,6.2-0.8,7.4-3c0.9-1.6,3-7.1,4.9-12.2     c-1.2-0.8-2.5-1.7-4-2.7C49.4,57.7,49,57.4,48.8,57.3z"/><path d="M97.4,43.5c-0.5-1.7-2.2-2.8-4-2.3c-0.8,0.2-6.7,1.8-10.3,2.8c-0.1-0.4-0.3-0.8-0.4-1.1c-1.4-4.1-3.5-10.3-8.9-12.4     c-1.2-0.5-4-1.7-5.8-2.5c-7.6-3.3-20.8,0.3-22.5,0.9c-0.9,0.4-2.9,1.1-8.7,12.5C36,43,36.7,45,38.3,45.8c0.5,0.2,1,0.4,1.5,0.4     c1.2,0,2.3-0.7,2.9-1.8c1.9-3.7,4.5-8.2,5.5-9.4c1.3-0.4,4.4-1.1,7.8-1.5c-3.7,5.1-7,13.2-7.6,16.1c-0.8,4.2,1,5.6,1.6,6     c1.4,1,14.2,9.5,16.1,11.5c-0.5,2.9-3.1,11.4-5.4,18.4c-0.7,2.2,0.5,4.6,2.7,5.3c0.4,0.1,0.9,0.2,1.3,0.2c1.8,0,3.4-1.1,4-2.9     c2.2-6.8,6-18.6,5.9-22c-0.1-3.3-3.1-6.2-9.7-10.7c2.1-5.2,5.6-12.7,8.9-16.6c1.2,1.8,2.1,4.3,2.7,6.2c1,2.8,1.6,4.8,3.5,5.7     c0.5,0.3,1.1,0.4,1.6,0.4c0.4,0,0.9-0.1,1.3-0.2c1.4-0.5,8-2.3,12.1-3.4C96.8,47,97.8,45.3,97.4,43.5z"/><ellipse transform="matrix(0.3937 -0.9192 0.9192 0.3937 28.3646 78.9709)" cx="74" cy="18" rx="9" ry="9"/><path d="M10.8,34.5h20.7c1.4,0,2.5-1.1,2.5-2.5s-1.1-2.5-2.5-2.5H10.8c-1.4,0-2.5,1.1-2.5,2.5S9.5,34.5,10.8,34.5z"/><path d="M7.9,45h20.7c1.4,0,2.5-1.1,2.5-2.5s-1.1-2.5-2.5-2.5H7.9c-1.4,0-2.5,1.1-2.5,2.5S6.5,45,7.9,45z"/><path d="M28.1,53c0-1.4-1.1-2.5-2.5-2.5H5c-1.4,0-2.5,1.1-2.5,2.5c0,1.4,1.1,2.5,2.5,2.5h20.7C27,55.5,28.1,54.4,28.1,53z"/></g></g></switch></svg>'
      return runnerIcon;
    },

    makeScan: (fill) => {
      const scanIcon = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 100 100" style="enable-background:new 0 0 100 100;" xml:space="preserve"><g><g fill-rule="evenodd" fill="' + fill + '"><path d="M23.3,62.8H9.2C6.9,62.8,5,64.7,5,67v14.2c0,2.3,1.9,4.2,4.2,4.2h14.2c2.3,0,4.2-1.9,4.2-4.2V67    C27.5,64.7,25.6,62.8,23.3,62.8z"/><path d="M90.8,62.8H76.7c-2.3,0-4.2,1.9-4.2,4.2v14.2c0,2.3,1.9,4.2,4.2,4.2h14.2c2.3,0,4.2-1.9,4.2-4.2V67    C95,64.7,93.1,62.8,90.8,62.8z"/><path d="M57.1,62.8H42.9c-2.3,0-4.2,1.9-4.2,4.2v14.2c0,2.3,1.9,4.2,4.2,4.2h14.2c2.3,0,4.2-1.9,4.2-4.2V67    C61.2,64.7,59.4,62.8,57.1,62.8z M57.1,81.1C57.1,81.1,57.1,81.1,57.1,81.1l-14.2,0c0,0,0,0,0,0l0-14.2c0,0,0,0,0,0h14.2    c0,0,0,0,0,0L57.1,81.1z"/><path d="M87.5,52.5l5-24.4l-9,3c-3.4-4.6-7.8-8.4-12.9-11.2c-6.2-3.4-13.3-5.2-20.6-5.2c-22.4,0-40.6,17-40.6,37.8    c0,1.7,1.4,3.1,3.1,3.1s3.1-1.4,3.1-3.1C15.6,35.1,31,20.9,50,20.9c10.7,0,20.7,4.6,27.2,12.2L68.8,36L87.5,52.5z"/></g></g></svg>';
      return scanIcon;
    },

    makeRabbit: (fill) => {
      const rabbitIcon = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" viewBox="0 0 100 75" version="1.1" x="0px" y="10px"><g stroke="none" stroke-width="1" fill-rule="evenodd" sketch:type="MSPage"><g sketch:type="MSArtboardGroup" transform="translate(0.000000, -7.000000)" fill="' + fill + '"><path d="M60.1164483,76.5101184 C60.1164483,77.7869765 61.1184016,79.097951 62.3543737,79.4324469 L72.798828,82.2590697 C74.9502082,82.841306 76.9428079,85.1218308 77.229578,87.3473934 L77.4381368,88.9659749 L61.2268002,86.7611761 C59.0007748,86.4584288 55.762595,85.1122528 53.9830021,83.7528954 L30.0193357,65.4480423 C18.6673757,64.6909954 9.4627489,56.133214 7.77382209,45.1160791 L4.34635739,45.1647777 C1.94608449,45.1988816 -1.83318034e-16,43.2833095 -1.07537429e-17,40.8862227 L12.0835739,27.3645101 C17.4743573,21.3386402 23.6068695,17.4194231 31.6593886,17.4194231 C32.7498041,17.4194231 33.8233498,17.4912885 34.8755022,17.6305187 C36.0956627,17.7349159 37.3050822,17.9433886 38.4888396,18.2605754 C54.0954993,22.4423673 65.570761,42.6024939 65.570761,42.6024939 C66.516058,44.0861571 68.636741,45.6806441 70.3388841,46.136732 L71.0643059,46.3311082 C72.7686884,46.7877961 75.036606,46.0402598 76.1348435,44.6627794 L79.3667959,40.6090557 L69.0683577,35.5886404 C54.9830017,29.5 58.824985,11.8109045 58.824985,11.8109045 C58.9924242,10.7260817 59.7843012,10.4649372 60.587326,11.2216236 L82.7393229,32.0953411 L64.7779732,12.0675015 C65.0289152,8.20500861 68.1652109,7 68.1652109,7 L85.5324488,34.7272898 L86.921334,36.0360295 L96.0521825,42.4677019 C98.138955,43.9376022 99.8625925,47.2144004 99.8888571,49.7773535 L100.007257,61.3310185 L99.3236978,61.8899026 C97.5857982,63.3108255 94.5445704,63.6651439 92.5224884,62.6881932 L89.3807164,61.1702742 C86.2103299,59.6385304 81.4523901,60.2321429 78.7512966,62.4950512 L69.6842316,70.0912108 C68.6969982,70.9182902 67.3970043,71.7079683 65.972973,72.3860195 C65.450814,57.828347 59.4984737,45.9574271 46.7248907,37.1161254 C45.6127483,36.4326524 43.9592431,38.4195836 44.7777067,39.1109172 C56.0407574,49.2817354 60.1164483,60.3235994 60.1164483,74.5177084 L60.1164483,76.5101184 Z M95.0509461,53.9162538 C96.1764172,53.9162538 97.0887918,53.0084656 97.0887918,51.8886521 C97.0887918,50.7688386 96.1764172,49.8610504 95.0509461,49.8610504 C93.925475,49.8610504 93.0131004,50.7688386 93.0131004,51.8886521 C93.0131004,53.0084656 93.925475,53.9162538 95.0509461,53.9162538 L95.0509461,53.9162538 Z M19.9417759,92 L19.9417759,89.8393536 C19.9417758,87.5932185 21.6918837,85.2820263 23.828826,84.6248277 C23.828826,84.6248277 35.0800582,81.8619915 38.1368268,76.9378159 C38.1368268,76.9378159 46.7248911,83.7447645 46.7248911,83.7447645 C34.7889374,89.6827409 19.9417759,92 19.9417759,92 L19.9417759,92 Z" sketch:type="MSShapeGroup"/></g></g></svg>';
      return rabbitIcon;
    },

    makeTurtle: () => {
      const turtleIcon = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 75 70" enable-background="new 0 0 95 95" xml:space="preserve"><path d="M87.242,46.239c-5.27,0-9.811,1.512-10.09,1.061c-0.281-0.445,1.796-1.456,3.025-2.802  C69.529,35.867,66.388,23.76,47.223,23.76c-19.398,0-24.78,18.723-35.316,28.476l1.905,1.904c0,0-3.586,1.238-6.277,1.57  c-2.691,0.336-6.951,0.741-6.951,1.348c0,0.531,5.606,0.896,8.407,0.896c2.804,0,7.513-0.338,7.513-0.338s0.337,0.445-2.47,1.342  c-2.804,0.9-3.471,1.686-5.49,4.266c-2.014,2.578-4.215,4.748-4.215,5.713c0,1.09,0.445,1.812,2.014,1.812S9.034,71,10.551,71  c2.909,0,2.909-1.807,3.694-3.152c0.789-1.348,1.362-2.158,2.258-2.943c0.901-0.787,2.02-1.008,3.474-1.568  c1.456-0.564,3.702-1.686,3.702-1.686s3.813,1.461,10.424,1.461c6.617,0,18.836-0.34,24.327-0.34c5.493,0,6.562-2.295,7.906-2.295  c0.672,0,3.981,1.965,3.981,2.748c0,1.117-5.161,4.93-5.161,6.051c0,1.125,1.795,1.965,5.05,1.965c4.653,0,5.205-2.605,6.501-4.207  c1.401-1.734,2.572-3.363,2.572-5.383c0-2.521-5.042-4.818-5.042-4.818s1.011-1.571,3.025-1.571c2.017,0,6.056,0.45,10.428,0.45  c4.373,0,6.727,0.56,6.727-3.589C94.417,47.976,92.514,46.239,87.242,46.239z M89.167,50.5c-0.553,0-1-0.447-1-1s0.447-1,1-1  s1,0.447,1,1S89.72,50.5,89.167,50.5z"/></svg>';
      return turtleIcon;
    },

    makeSnail: () => {
      const snailIcon = '<svg style="transform:scaleX(-1.0)" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" version="1.1" x="0px" y="5px" viewBox="0 0 75 75"><g transform="translate(0,-952.36218)"><path style="text-indent:0;text-transform:none;direction:ltr;block-progression:tb;baseline-shift:baseline;color:#000000;enable-background:accumulate;" d="m 63.748703,971.36229 c -5.43917,0.046 -12.9678,1.9026 -17.33056,4.9688 -5.33006,3.7325 -9.84923,9.9737 -12.23149,20.2812 -1.91437,7.74631 -1.56839,15.38211 1.72054,19.75001 5.65023,-0.3712 12.79569,-0.6555 19.30136,-0.4375 -5.52288,-4.5469 -7.39127,-10.3988 -7.25756,-17.56251 -0.0291,-9.4042 7.41348,-15 14.82795,-15 6.96147,0.06 12.98292,5.6893 12.88842,13 -0.0443,5.72511 -4.66524,9.92801 -9.91658,10.00001 -3.86287,-0.055 -8.81178,-2.1402 -8.91553,-7.00003 0.012,-3.41788 2.27613,-6.76628 5.94369,-6.99998 0.52311,-0.01 1.00104,0.4716 1.00104,1 0,0.5284 -0.47793,1.01 -1.00104,1 -2.58389,0.4032 -3.81164,2.1726 -3.94161,4.99998 0.0869,3.54803 4.10317,4.92403 6.91345,5.00003 4.15393,-0.085 7.88782,-3.7511 7.94578,-8.00001 -0.0251,-5.3606 -4.55816,-11 -10.91762,-11 -6.44788,0 -12.88287,4.6227 -12.85715,12.9688 -0.0323,6.38281 1.10231,13.05131 8.54015,17.68741 10.33074,0.4959 17.71944,1.8254 22.77372,2.625 3.622699,-1.5245 6.11839,-4.1742 7.789365,-8 1.71466,-3.9255 2.5026,-9.064 2.5026,-15.25001 0,-13.3656 -12.517635,-24.0313 -27.778925,-24.0312 z m -45.73514,1 c -1.65858,0 -3.00313,1.3431 -3.00313,3 0,1.6569 1.34455,3 3.00313,3 0.59787,0 1.15869,-0.1992 1.62669,-0.5 1.92801,1.5462 3.44429,3.6637 3.409799,5.9375 -0.0532,2.3056 -1.432899,5.3535 -2.09593,10.1875 -0.37363,-0.053 -0.78261,-0.094 -1.18874,-0.094 -0.58486,0.01 -1.18456,0.1249 -1.81439,0.2813 0.087,-2.7692 -0.50124,-4.9363 -1.34515,-7.0625 -0.88646,-2.2334 -2.73222,-4.4208 -5.91241,-7.5 0.18193,-0.3868 0.31283,-0.7944 0.31283,-1.25 0,-1.6569 -1.3445495,-3 -3.0031295,-3 -1.65858,0 -3.00313,1.3431 -3.00313,3 0,1.6569 1.34455,3 3.00313,3 0.46283,0 0.89106,-0.1257 1.28258,-0.3125 3.0970895,3.0036 4.7355995,4.9984 5.4431695,6.7813 0.74291,1.8716 1.40489,3.8601 1.15746,7 -0.16002,0.067 -0.31086,0.1478 -0.46924,0.2187 -0.89952,8.26371 -0.58523,17.83861 2.47133,25.28131 3.12374,7.606 8.840111,13.0022 19.30135,13.0312 l 57.810216,0 c -0.672391,-1.924 -2.13834,-4.398 -4.410841,-6.7188 -2.40769,-2.4191 -5.888875,-4.6967 -9.635035,-6 -8.34215,-1.2926 -22.74908,-3.8874 -46.07925,-2.2187 -2.51776,-0.2143 -4.76029,-1.7063 -6.06882,-3.6563 -3.74447,-5.5541 -3.29333,-13.0509 -5.25548,-19.75001 -0.18057,-0.1675 -0.39608,-0.3318 -0.65693,-0.4687 0.62315,-4.7755 2.09036,-7.7341 2.1585,-10.6875 -0.1,-3.42 -1.90212,-5.6714 -4.19187,-7.5938 0.0934,-0.2898 0.15641,-0.5852 0.15641,-0.9062 0.0525,-1.7066 -1.59672,-2.9573 -3.00312,-2.9998 z" fill="#000000" fill-opacity="1" stroke="none" marker="none" visibility="visible" display="inline" overflow="visible"/></g></svg>';
      return snailIcon;
    },

    makeSprayCanIcon: () => {
      const sprayCanIcon = '<span><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" style="width:20px;height:12px;" viewBox="0 0 88 88" enable-background="new 0 0 100 100" xml:space="preserve"><path d="M30.292,91.893c-0.277,0-0.552-0.114-0.75-0.338l-2.614-2.956  c-0.366-0.413-0.327-1.046,0.086-1.411c0.414-0.365,1.047-0.327,1.412,0.087l2.614,2.956c0.366,0.413,0.327,1.046-0.086,1.411  C30.764,91.81,30.528,91.893,30.292,91.893z M26.219,85.882c-0.332,0-0.656-0.165-0.847-0.466l-1.656-2.622  c-0.295-0.467-0.155-1.085,0.312-1.38c0.465-0.295,1.084-0.156,1.379,0.312l1.656,2.622c0.295,0.467,0.155,1.085-0.312,1.38  C26.586,85.832,26.402,85.882,26.219,85.882z M10.305,85.543c-0.413,0-0.799-0.257-0.943-0.668L8.17,81.488  c-0.183-0.521,0.091-1.092,0.612-1.275c0.519-0.188,1.092,0.091,1.275,0.611l1.191,3.387c0.183,0.521-0.091,1.092-0.612,1.275  C10.527,85.525,10.415,85.543,10.305,85.543z M84.585,81.594c-0.552,0-1-0.447-1-1v-2.37c0-0.553,0.448-1,1-1s1,0.447,1,1v2.37  C85.585,81.146,85.137,81.594,84.585,81.594z M23.399,79.747c-0.364,0-0.715-0.199-0.892-0.546  c-5.812-11.412-2.957-18.242-0.737-21.298c0.626-0.862,1.326-1.614,2.066-2.26c-0.73-1.527-1.142-3.388-0.999-5.575  c0.398-6.072,3.779-9.768,7.464-11.549c-0.075-0.425-0.104-0.851-0.079-1.273c0.373-6.19,3.492-11.47,9.269-15.692  c0.446-0.325,1.071-0.229,1.397,0.218c0.326,0.445,0.229,1.071-0.217,1.397c-5.273,3.854-8.117,8.631-8.453,14.198  c-0.008,0.129-0.006,0.263,0.004,0.398c0.222-0.067,0.444-0.129,0.665-0.185c3.565-0.885,6.866-0.192,8.028,1.689  c0.469,0.759,0.976,2.358-0.893,4.539c-1.135,1.327-2.825,1.668-4.636,0.935c-1.701-0.688-3.474-2.361-4.438-4.311  c-2.501,1.267-5.737,4.008-6.114,9.766c-0.107,1.637,0.158,3.044,0.651,4.221c2.304-1.447,4.773-1.989,6.625-1.696  c1.512,0.238,2.556,1.021,2.941,2.201c0.958,2.938-0.12,4.43-0.848,5.059c-1.396,1.204-3.763,1.251-6.033,0.122  c-1.153-0.574-2.318-1.482-3.266-2.72c-0.546,0.499-1.059,1.064-1.516,1.693c-3.367,4.637-3.047,11.46,0.901,19.214  c0.25,0.492,0.055,1.095-0.438,1.346C23.707,79.712,23.552,79.747,23.399,79.747z M26.495,56.169  c0.748,0.979,1.662,1.695,2.567,2.146c1.498,0.745,3.075,0.81,3.834,0.153c0.819-0.707,0.51-2.136,0.253-2.925  c-0.18-0.551-0.834-0.764-1.352-0.845C30.364,54.474,28.363,54.982,26.495,56.169z M32.819,39.677  c0.718,1.374,1.986,2.676,3.316,3.213c1.519,0.616,2.158-0.135,2.368-0.381c0.447-0.522,1.134-1.501,0.71-2.188  c-0.581-0.94-2.979-1.512-5.843-0.799C33.215,39.562,33.029,39.611,32.819,39.677z M8.299,77.702c-0.497,0-0.927-0.369-0.991-0.875  L6.76,72.481c-0.069-0.548,0.319-1.048,0.867-1.117c0.546-0.063,1.048,0.318,1.117,0.867l0.548,4.346  c0.069,0.548-0.319,1.048-0.867,1.117C8.383,77.699,8.341,77.702,8.299,77.702z M84.585,75.176c-0.552,0-1-0.447-1-1v-7.112  c0-0.553,0.448-1,1-1s1,0.447,1,1v7.112C85.585,74.729,85.137,75.176,84.585,75.176z M7.632,68.187c-0.552,0-1-0.447-1-1v-4.063  c0-0.553,0.448-1,1-1s1,0.447,1,1v4.063C8.632,67.739,8.185,68.187,7.632,68.187z M84.585,63.322c-0.552,0-1-0.447-1-1V37.405  c0-0.553,0.448-1,1-1s1,0.447,1,1v24.917C85.585,62.875,85.137,63.322,84.585,63.322z M7.658,59.402c-0.009,0-0.018,0-0.027,0  c-0.552-0.016-0.988-0.475-0.973-1.026c0.345-12.844,4.494-18.087,7.337-20.179c0.154-0.413,0.33-0.842,0.53-1.288  c3.832-8.567,13.136-16.174,25.527-20.871c0.517-0.194,1.094,0.064,1.29,0.581s-0.064,1.094-0.581,1.29  c-11.451,4.34-20.123,11.193-23.981,18.909c1.926-0.503,3.74-0.106,4.861,1.103c1.118,1.207,1.284,3.004,0.442,4.807  c-1.462,3.134-4.531,4.828-6.84,3.769c-1.321-0.604-2.312-2.105-2.115-4.675c-2.346,3.048-4.25,8.389-4.471,16.607  C8.643,58.972,8.198,59.402,7.658,59.402z M15.668,39.46c-1.003,3-0.587,4.764,0.406,5.218c1.131,0.513,3.128-0.506,4.196-2.796  c0.5-1.071,0.465-1.995-0.097-2.603c-0.686-0.739-2.026-0.88-3.414-0.357C16.398,39.058,16.033,39.236,15.668,39.46z M44.426,20.661  c-0.358,0-0.705-0.192-0.884-0.531c-0.259-0.487-0.074-1.093,0.414-1.352c1.179-0.627,2.449-1.23,3.774-1.794  c0.51-0.218,1.096,0.021,1.312,0.528c0.216,0.508-0.02,1.096-0.528,1.312c-1.272,0.542-2.49,1.12-3.619,1.72  C44.745,20.624,44.584,20.661,44.426,20.661z M43.329,16.909c-0.403,0-0.784-0.246-0.935-0.646c-0.196-0.517,0.064-1.094,0.581-1.29  c0.439-0.166,0.782-0.279,1.084-0.294c0.085-0.022,0.199-0.055,0.351-0.1c0.527-0.157,1.085,0.147,1.241,0.679  c0.156,0.53-0.148,1.085-0.678,1.241c-0.34,0.1-0.648,0.189-0.925,0.207c-0.085,0.031-0.203,0.076-0.364,0.138  C43.566,16.889,43.447,16.909,43.329,16.909z M55.574,16.296c-0.435,0-0.834-0.285-0.96-0.724c-0.153-0.531,0.154-1.085,0.685-1.237  c0.778-0.224,1.567-0.438,2.365-0.641c0.539-0.138,1.08,0.188,1.216,0.722c0.137,0.535-0.187,1.079-0.722,1.216  c-0.779,0.199-1.548,0.407-2.308,0.625C55.758,16.283,55.665,16.296,55.574,16.296z M48.571,15.53c-0.456,0-0.868-0.313-0.974-0.777  c-0.124-0.538,0.213-1.074,0.751-1.197c1.599-0.366,3.268-0.689,4.961-0.96c0.542-0.093,1.058,0.284,1.146,0.829  c0.087,0.546-0.284,1.059-0.829,1.146c-1.65,0.265-3.276,0.579-4.832,0.935C48.72,15.522,48.645,15.53,48.571,15.53z M61.835,13.657  c-0.522,0-0.962-0.406-0.997-0.935c-0.036-0.552,0.382-1.027,0.933-1.063c0.938-0.061,1.89-0.11,2.857-0.146  c0.543-0.049,1.017,0.409,1.037,0.961c0.021,0.553-0.41,1.017-0.962,1.037c-0.949,0.036-1.883,0.084-2.803,0.145  C61.879,13.656,61.857,13.657,61.835,13.657z M90.627,90.353H60.354c-2.063,0-3.74-1.578-3.74-3.519v-55.19  c0-0.67,0.2-1.297,0.547-1.831c-0.36-0.715-0.547-1.488-0.547-2.153v-1.615c0-1.949,1.587-4.036,3.95-4.036h0.668  c0.846-2.483,2.916-6.444,6.424-6.444h0.961V9.107c0-1.104,0.896-2,2-2h9.747c1.104,0,2,0.896,2,2v6.456h1.303  c3.528,0,5.423,3.941,6.154,6.444h0.243c2.424,0,4.304,2.17,4.304,4.036v1.668c0,0.616-0.217,1.336-0.606,2.014  c0.383,0.552,0.606,1.211,0.606,1.918v55.19C94.368,88.774,92.69,90.353,90.627,90.353z M60.614,86.353h29.753V32.125H60.614V86.353  z M60.795,28.125h29.177c0.135-0.088,0.331-0.344,0.395-0.516v-1.386c-0.081-0.105-0.237-0.216-0.304-0.216h-29.42  c-0.015,0.026-0.027,0.057-0.031,0.077l0.002,1.574C60.624,27.772,60.71,27.991,60.795,28.125z M65.55,22.008h20.043  c-0.534-1.222-1.322-2.444-1.926-2.444h-16.01C67.005,19.563,66.162,20.775,65.55,22.008z M72.618,15.563h5.747v-4.456h-5.747  V15.563z"/>';
      return sprayCanIcon;
    },

    makeSettingsIcon: (opts) => {
      return sticker.makeSimplePath(
        $.extend({}, true, opts, {
          viewBox: [0, 0, 100, 100],
          d: [ "M49.71,95c-2.757,0-3.253-2.49-3.871-5.594c-0.733-3.752-2.109-5.723-4.478-6.466    c-0.056-0.018-0.139-0.054-0.214-0.094c-0.562-0.147-1.115-0.307-1.663-0.486c-2.331-0.595-4.53,0.338-7.074,3.036    c-2.354,2.489-4.2,4.437-6.758,2.393l-1.186-0.943c-0.333-0.264-0.585-0.462-2.394-1.91c-0.025-0.018-0.049-0.037-0.073-0.057    c-0.01-0.008-0.02-0.015-0.03-0.023l-2.008-1.615c-0.456-0.368-0.456-0.368-1.456-1.162l-0.12-0.096    c-2.544-2.051-1.06-4.266,0.817-7.071c2.121-3.157,2.54-5.525,1.394-7.735l0.001,0c-0.024-0.048-0.047-0.101-0.066-0.154    c-0.294-0.508-0.566-1.032-0.834-1.552c-1.227-2.076-3.449-2.978-7.166-2.882c-3.442,0.089-6.108,0.155-6.471-3.086l-0.16-1.458    c-0.049-0.451-0.075-0.697-0.345-3.105l0.961-0.217l-0.972,0.109l-0.508-4.569c-0.361-3.253,2.258-3.767,5.575-4.418    c3.736-0.741,5.708-2.121,6.453-4.485c0.015-0.05,0.045-0.118,0.077-0.182c0.133-0.503,0.305-1.122,0.513-1.732    c0.568-2.3-0.366-4.495-3.051-7.035c-2.499-2.37-4.433-4.204-2.394-6.764l2.871-3.585c0.018-0.027,0.046-0.064,0.066-0.089    l2.877-3.583c2.039-2.558,4.261-1.065,7.075,0.827c3.153,2.112,5.524,2.529,7.722,1.38c0.038-0.02,0.087-0.04,0.138-0.058    c0.542-0.31,1.052-0.571,1.571-0.833c2.074-1.219,2.98-3.443,2.882-7.181c-0.09-3.432-0.16-6.087,3.084-6.464l9.241-1.029    c3.239-0.354,3.773,2.269,4.426,5.593c0.725,3.714,2.104,5.686,4.478,6.437c0.056,0.018,0.141,0.056,0.218,0.096    c0.544,0.141,1.092,0.304,1.628,0.473c2.345,0.607,4.551-0.321,7.092-3.028c2.38-2.499,4.214-4.425,6.761-2.394l1.256,1.001    c0.307,0.243,0.642,0.509,2.327,1.858c0.018,0.013,0.035,0.027,0.052,0.042c0.02,0.015,0.038,0.031,0.053,0.043l3.58,2.864    c2.535,2.039,1.069,4.237-0.785,7.021l-0.064,0.096c-2.087,3.111-2.507,5.481-1.361,7.686c0.022,0.042,0.045,0.1,0.065,0.16    c0.26,0.453,0.498,0.918,0.741,1.393l0.021,0.04c0.008,0.012,0.016,0.025,0.023,0.038c1.246,2.152,3.475,3.058,7.215,2.955    c3.451-0.087,6.11-0.156,6.469,3.088l0.506,4.527c0.008,0.041,0.013,0.082,0.016,0.122c0.001,0.011,0.003,0.021,0.004,0.031    l0.134,1.238c0.17,1.562,0.17,1.562,0.235,2.134l0.136,1.196c0,0.002,0,0.004,0,0.006c0.348,3.233-2.248,3.751-5.535,4.407    l-0.1,0.02c-3.676,0.719-5.647,2.096-6.396,4.465c-0.018,0.057-0.06,0.151-0.1,0.229c-0.126,0.489-0.289,1.049-0.469,1.616    c-0.61,2.336,0.321,4.543,3.033,7.107c2.489,2.365,4.424,4.205,2.39,6.755c-0.684,0.853-0.836,1.045-1.038,1.301    c-0.236,0.299-0.541,0.684-1.831,2.297c-0.018,0.023-0.04,0.047-0.062,0.071l-2.883,3.598c-2.032,2.537-4.235,1.07-7.025-0.786    l-0.089-0.059c-3.109-2.091-5.479-2.513-7.687-1.368c-0.039,0.02-0.094,0.043-0.15,0.063c-0.478,0.275-1.001,0.555-1.536,0.818    c-2.089,1.218-3,3.445-2.896,7.188c0.095,3.422,0.169,6.102-3.088,6.466l-1.591,0.182c-0.389,0.046-0.814,0.096-2.977,0.339    c-0.034,0.004-0.069,0.006-0.103,0.006v0c-0.001,0-0.008,0.003-0.041,0.005c-1.837,0.205-2.403,0.266-2.773,0.306    c-0.386,0.042-0.558,0.06-1.752,0.197C50.07,94.99,49.885,95,49.71,95z M42.039,81.104c4,1.332,5.169,5.109,5.704,7.848    c0.741,3.722,1.019,4.213,2.307,4.072c1.195-0.137,1.367-0.155,1.757-0.197c0.372-0.04,0.942-0.102,2.807-0.31    c0.014-0.002,0.028-0.003,0.043-0.004c0.043-0.005,0.093-0.009,0.128-0.009c2.086-0.236,2.511-0.286,2.898-0.331l1.601-0.183    c1.291-0.145,1.455-0.684,1.351-4.438c-0.08-2.851,0.242-6.851,3.927-8.995c0.573-0.285,1.075-0.553,1.569-0.838    c0.056-0.032,0.136-0.066,0.212-0.091c3.785-1.889,7.288-0.046,9.604,1.513l0.085,0.056c3.078,2.049,3.614,2.192,4.415,1.192    l2.875-3.589c0.013-0.016,0.074-0.088,0.088-0.104c0.008-0.009,0.016-0.017,0.024-0.025l0.003-0.003    c1.239-1.552,1.543-1.936,1.778-2.234c0.204-0.258,0.357-0.451,1.045-1.309c0.803-1.006,0.539-1.502-2.173-4.079    c-2.079-1.965-4.673-5.008-3.601-9.104c0.188-0.596,0.345-1.137,0.492-1.692c0.019-0.074,0.066-0.181,0.112-0.267    c1.32-4.013,5.112-5.19,7.86-5.728l0.097-0.019c3.625-0.724,4.11-1.001,3.973-2.277l-0.136-1.191    c-0.066-0.575-0.066-0.575-0.236-2.145l-0.134-1.233c-0.002-0.013-0.003-0.026-0.005-0.039c-0.004-0.024-0.008-0.048-0.011-0.072    l-0.511-4.57c-0.141-1.279-0.675-1.445-4.392-1.349c-2.88,0.083-6.843-0.229-8.992-3.846c-0.029-0.04-0.055-0.082-0.078-0.127    l-0.063-0.123c-0.243-0.475-0.48-0.94-0.744-1.393c-0.036-0.062-0.073-0.151-0.099-0.235c-1.907-3.722-0.053-7.256,1.514-9.59    l0.063-0.094c2.045-3.068,2.19-3.604,1.189-4.409L76.8,16.676c-0.096-0.053-0.175-0.118-0.238-0.192    c-1.56-1.248-1.884-1.505-2.181-1.741l-1.261-1.006c-1.004-0.8-1.499-0.541-4.068,2.157c-3.053,3.252-6.017,4.42-9.104,3.617    c-0.592-0.185-1.151-0.35-1.701-0.49c-0.07-0.018-0.138-0.043-0.203-0.076c-0.019-0.01-0.05-0.028-0.081-0.047    c-4.002-1.32-5.176-5.11-5.712-7.857c-0.73-3.718-1.007-4.21-2.298-4.066l-9.238,1.029c-1.295,0.15-1.447,0.644-1.349,4.399    c0.076,2.885-0.248,6.876-3.9,9.019c-0.584,0.297-1.105,0.564-1.616,0.858c-0.057,0.033-0.136,0.067-0.212,0.093    c-3.699,1.921-7.246,0.064-9.588-1.507c-3.15-2.118-3.691-2.267-4.497-1.257l-2.879,3.586c0.016-0.014-0.011,0.02-0.065,0.088    l-2.87,3.584c-0.806,1.012-0.544,1.507,2.163,4.074c2.071,1.959,4.643,4.975,3.63,9.053c-0.213,0.634-0.373,1.211-0.525,1.786    c-0.019,0.071-0.058,0.165-0.101,0.246c-1.297,3.988-5.099,5.177-7.854,5.724c-3.725,0.731-4.212,1.008-4.07,2.293l0.508,4.568    l0.011,0.108c0.27,2.414,0.297,2.66,0.346,3.111l0.159,1.453c0.143,1.278,0.675,1.441,4.406,1.348    c2.867-0.079,6.849,0.247,8.999,3.893c0.296,0.574,0.57,1.101,0.868,1.609c0.042,0.071,0.074,0.146,0.097,0.225    c1.893,3.754,0.046,7.266-1.514,9.587c-2.112,3.155-2.26,3.697-1.255,4.507l0.114,0.091c1.008,0.8,1.008,0.8,1.468,1.171    l1.993,1.603c0.051,0.033,0.1,0.071,0.144,0.114c1.773,1.419,2.022,1.616,2.352,1.877l1.193,0.949    c1.012,0.809,1.511,0.545,4.099-2.19c1.935-2.052,4.959-4.639,9.06-3.588c0.61,0.198,1.165,0.356,1.729,0.502    c0.057,0.015,0.112,0.034,0.165,0.059C41.954,81.056,41.998,81.08,42.039,81.104z M21.972,84.854c0,0.001,0.002,0.002,0.006,0.005    C21.976,84.858,21.974,84.856,21.972,84.854z M41.9,81.059c0.027,0.008,0.054,0.017,0.08,0.025    C41.956,81.075,41.929,81.066,41.9,81.059z M66.309,77.644c-0.026,0.011-0.054,0.025-0.083,0.043    C66.254,77.673,66.282,77.658,66.309,77.644z M22.277,66.181c0,0,0.001,0.001,0.001,0.002    C22.278,66.182,22.277,66.181,22.277,66.181z M81.071,58.039c-0.004,0.011-0.008,0.024-0.011,0.036    C81.064,58.064,81.068,58.051,81.071,58.039z M92.594,45.606c0,0.001,0,0.001,0.001,0.002    C92.595,45.608,92.595,45.607,92.594,45.606z M92.593,45.605L92.593,45.605L92.593,45.605z M92.502,45.268    c0,0.011,0,0.028,0.003,0.051C92.504,45.301,92.503,45.283,92.502,45.268z M58.046,18.927c0.004,0.001,0.009,0.003,0.013,0.004    C58.055,18.929,58.051,18.928,58.046,18.927z M76.969,16.756C76.969,16.756,76.969,16.756,76.969,16.756    C76.969,16.756,76.969,16.756,76.969,16.756z M76.967,16.755L76.967,16.755L76.967,16.755z M76.965,16.754    C76.965,16.754,76.965,16.755,76.965,16.754C76.965,16.755,76.965,16.754,76.965,16.754z M76.963,16.754    C76.963,16.754,76.963,16.754,76.963,16.754C76.963,16.754,76.963,16.754,76.963,16.754z M76.961,16.753L76.961,16.753    L76.961,16.753z M49.964,65.65c-3.537,0-6.945-1.189-9.747-3.43c-3.266-2.611-5.318-6.337-5.777-10.491    c-0.951-8.579,5.252-16.333,13.827-17.286c4.16-0.464,8.243,0.721,11.506,3.332c3.264,2.612,5.315,6.34,5.777,10.499    c0.462,4.154-0.722,8.24-3.335,11.504s-6.339,5.315-10.492,5.774C51.134,65.617,50.547,65.65,49.964,65.65z M50.025,36.301    c-0.512,0-1.026,0.029-1.543,0.086c-7.503,0.834-12.93,7.62-12.098,15.126c0.402,3.634,2.197,6.893,5.054,9.178    c2.857,2.284,6.433,3.32,10.069,2.916c0,0,0,0,0,0c3.633-0.401,6.893-2.195,9.179-5.051c2.287-2.857,3.323-6.432,2.919-10.066    c-0.405-3.639-2.2-6.902-5.055-9.188C56.099,37.342,53.119,36.301,50.025,36.301z"],
          fill: opts.color,
        })
      );
    },

    makeNoEntryIcon: (fill) => {
      const noEntryIcon = '<svg xmlns="http://www.w3.org/2000/svg" data-name="Layer 1" viewBox="0 0 100 100" x="0px" y="0px"><g fill-rule="evenodd" fill="' + fill + '"><path data-name="Compound Path" d="M50,89.11A39.11,39.11,0,1,0,22.33,77.66,39,39,0,0,0,50,89.11ZM72,72a31.17,31.17,0,0,1-41.28,2.42l43.71-43.7A31.17,31.17,0,0,1,72,72ZM28,28a31.16,31.16,0,0,1,40.72-2.86L25.14,68.71A31.17,31.17,0,0,1,28,28Z"/></g></svg>';
      return noEntryIcon;
    },

    makeTrashIcon: (fill) => {
      const trashIcon = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 26" version="1.1" x="0px" y="0px"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g transform="scale(1.2 1.2) translate(-2 0)"><rect x="0" y="0" width="24" height="24"/><path d="M5,6 L5.73274082,20.8571429 C5.73274082,20.8571429 5.99625939,22 6.98958614,22 L11.598019,22 L12.4359159,22 L17.0443487,22 C18.0380944,22 18.301613,20.8571429 18.301613,20.8571429 L19,6 L5,6 Z M15.5,8 L15.5,8 L15.5,8 C15.2205531,8 14.9908183,8.22036187 14.9791847,8.49956654 L14.5208153,19.5004335 L14.5208153,19.5004335 C14.5097883,19.7650799 14.7153876,19.9885573 14.980034,19.9995842 C14.9866857,19.9998614 14.9933425,20 15,20 L15,20 L15,20 C15.2794469,20 15.5091817,19.7796381 15.5208153,19.5004335 L15.9791847,8.49956654 L15.9791847,8.49956654 C15.9902117,8.23492012 15.7846124,8.01144271 15.519966,8.00041578 C15.5133143,8.00013862 15.5066575,8 15.5,8 Z M9.47918818,19.5003499 L9.02097843,8.49965006 L9.02097843,8.49965006 C9.00934688,8.22039979 8.77957571,8 8.50008331,8 L8.50008331,8 L8.50008331,8 C8.23515945,8 8.02039624,8.21476322 8.02039624,8.47968707 C8.02039624,8.48634356 8.02053479,8.49299933 8.02081182,8.49965006 L8.47902157,19.5003499 L8.47902157,19.5003499 C8.49065312,19.7796002 8.72042429,20 8.99991669,20 L8.99991669,20 L8.99991669,20 C9.26484055,20 9.47960376,19.7852368 9.47960376,19.5203129 C9.47960376,19.5136564 9.47946521,19.5070007 9.47918818,19.5003499 Z M8.00719509,3 L5.11111111,3 L5.11111111,3 C4.49746139,3 4,3.49746139 4,4.11111111 L4,4.11111111 L4,5 L20,5 L20,4.11111111 C20,3.49746139 19.5025386,3 18.8888889,3 L15.9926121,3 C15.9368649,2.4385197 15.4631369,2 14.8869871,2 L9.11301289,2 C8.99358834,2 8.87494478,2.0192532 8.76164871,2.05701856 C8.33332638,2.19979267 8.04982846,2.57814658 8.00719509,3 Z M12,8 C12.2761424,8 12.5,8.22385763 12.5,8.5 L12.5,19.5 C12.5,19.7761424 12.2761424,20 12,20 C11.7238576,20 11.5,19.7761424 11.5,19.5 L11.5,8.5 C11.5,8.22385763 11.7238576,8 12,8 Z" fill="#000000"/></g></g></svg>';
      return trashIcon;
    },

    makeCompressTimeIcon: (fill) => {
      const compressTimeIcon = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="-434 236 90 80" style="enable-background:new -434 236 90 90;" xml:space="preserve"><g fill-rule="evenodd" fill="' + fill + '"><path d="M-354.9,251.1h-5.3h-2.6v2.6v27.8c-0.1-0.3-0.3-0.5-0.5-0.8l-29.1-29.1c-0.5-0.5-1-0.7-1.3-0.5c-0.4,0.2-0.5,0.6-0.5,1.3   v29.1c-0.1-0.3-0.3-0.5-0.5-0.8l-29.1-29.1c-0.5-0.5-1-0.7-1.3-0.5c-0.4,0.2-0.5,0.6-0.5,1.3v60.4c0,0.7,0.2,1.1,0.5,1.3   c0.4,0.2,0.8,0,1.3-0.5l29.1-29.1c0.2-0.2,0.4-0.5,0.5-0.8v29.1c0,0.7,0.2,1.1,0.5,1.3c0.4,0.2,0.8,0,1.3-0.5l29.1-29.1   c0.2-0.2,0.4-0.5,0.5-0.8v27.8v2.6h2.6h5.3h2.6v-2.6v-57.8v-2.6H-354.9z"/></g></svg>';
      return compressTimeIcon;
    },

    makeSmallUdacityIcon: (opts) => {
      const udacityHtml = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" width="' +
                          opts.width + 'px" height="' + opts.height + 'px" viewBox="0 0 32 32" ' +
                          'enable-background="new 0 0 32 32">' +
                          '<image x="0" y="0" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJN AAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAABOFBMVEUAs+YAsuYKvOkSveo1 xezR8vv6/v6I3PQowuu+7Pn///+V4PUCu+my6Pgdv+u66/ln0/Hv+v31/P531/P9/v8At+j3/f7a 9PxLy+/+//8twuzM8Pv8/v9t1fLt+v3u+v1v1fIAtOeY4fXg9vxKy+6S3/UAuOgAtecAs+f2/P4g v+ut5/d21/NXzvCg4/ZWzvDi9/zT8vs9yO3l+PwAuenc9fuX4fWG3PPC7frD7fpHyu4zxez7/v84 xu3s+f0MvOp42POo5fdUzu/U8vxZz/CR3/Wr5vfS8vvn+P0rw+wPvOokwOv5/f606fgAuunX8/xr 1PLQ8ftSze8AtugnwuuU4PUEu+nW8/yJ3PQYv+qQ3/TP8fuq5vfh9vzB7fq/7Pn0/P5w1fI3xu2s 5/fm+PyN3vQ5x+0xxOwxFuTVAAAAAWJLR0QKaND0VgAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAAd0 SU1FB+IKHAUqGL3rdjoAAAFBSURBVDjL5dPZUsIwFAbgBMTqj6BiF0FcsGLdEaniUtwVVMR93/f3 fwPbkpS0Os5wbW7Sk/NN0ov/EEL/XIQ0AUgo0Az7QUukVRLbbe2ICqAjBns12vHOes0A6epGokf2 gCKp0HqTHkj1AbEQTXPQP4DBoQz1wLAMfcQ+9wCQHbU3DwCSQf3ArQUwRv8RUINgPAB0TIhAgRYA k5gSwTRmGEgj457nMOt+EBeQPOYYKMCsR2oeC85uwn6cFrHIE7WE5frVKxaydl1CnpJicnWNg3Vs sN/ftLC1bexgN1dGZc8L7b4lHzBR0oGq5aTtsCakOoojhQnj+MRpF059sT8rIxLmeTyvQL7gnof2 8grq9Y07C7dV3KV+Do5yb9/78PikAc8v4rA1Buf1LeE8/v5h+qZLHD0j/vlVo4HV1PD+Dr4BCLwn yyZy1tMAAAAldEVYdGRhdGU6Y3JlYXRlADIwMTgtMTAtMjhUMTI6NDI6MjQtMDc6MDC16UJJAAAA JXRFWHRkYXRlOm1vZGlmeQAyMDE4LTEwLTI4VDEyOjQyOjI0LTA3OjAwxLT69QAAAABJRU5ErkJg gg==" width="32" height="32"></image>' + 
                          '</svg>';
      return udacityHtml;
    },

    makeLabelHtml: (opts) => {
      const dimensions = opts.dimensions;
      
      const labelAttr = {
        style: 'width:' + dimensions.width + 'px;' + 'height:' + dimensions.height + 'px;' + 'left:' + dimensions.x + 'px;' + 'top:' + dimensions.y + 'px;' +
               'opacity:' + opts.opacity + ';color:' + opts.color + ';padding-top:10px;'
      };
      
      const labelHtml = '<div class="graffiti-sticker-inner">' + 
                        sticker.makeElementHtml('div', labelAttr, '<div>' + opts.label + '</div>') + 
                        '</div>';
      return labelHtml;
    },

    makeHomeFolderIcon: (opts) => {
      const homeFolderIcon = '<svg xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" xmlns:cc="http://creativecommons.org/ns#" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" version="1.1" x="0px" y="0px" viewBox="10 10 75 75"><g transform="translate(0,-952.36218)"><path style="baseline-shift:baseline;block-progression:tb;color:#000000;direction:ltr;text-indent:0;enable-background:accumulate;text-transform:none;" fill="#000" d="m13.812,968.89c-0.51636,0.005-0.86248,0.14455-1.0312,0.28125-0.16877,0.1367-0.25,0.26805-0.25,0.65625v3.8125,1h-1-1.5312c-0.41876,0.003-0.66765,0.1155-0.8125,0.25-0.13976,0.1297-0.2422,0.34985-0.25,0.78125,0.000058,0.017-0.000057,0.0143,0,0.0312,0.0088,2.6282,0.0011,3.3996,0,4.8438h82.125v-4.875c0-0.4119-0.12605-0.606-0.28125-0.75s-0.3925-0.29125-0.875-0.28125h-0.03125-44.562-1v-1-3.7188c0-0.4015-0.08843-0.6006-0.25-0.75s-0.44128-0.28125-0.875-0.28125h-29.375zm-5.4688,13.656c-0.050524,0.004-0.098821,0.0172-0.15625,0.0312-0.064504,0.012-0.13338,0.0425-0.1875,0.0625-0.34403,0.1268-0.49236,0.38875-0.5,0.78125-0.000232,0.012,0,0.0193,0,0.0312l1.7812,51.437a1.0001,1.0001,0,0,1,0,0.062c0,0.1465,0.079205,0.3075,0.34375,0.5,0.26454,0.1926,0.71304,0.3438,1.0938,0.3438l79.031,0.031a1.0001,1.0001,0,0,1,0.03125,0c0.56827,0.011,0.65633-0.094,0.65625-0.094-0.00008,0.0001,0.10538-0.1587,0.09375-0.7188a1.0001,1.0001,0,0,1,0,-0.062l1.97-51.44c0-0.012,0.000232-0.0192,0-0.0312-0.0077-0.3976-0.14181-0.6885-0.5-0.8125h-0.03125c-0.11803-0.036-0.27448-0.0625-0.4375-0.0625h-0.03125-83.031a1.0001,1.0001,0,0,1,-0.0625,0c-0.023769,0.0009-0.039804,0-0.0625,0zm41.656,8.375,20.219,20.219-3.9062,3.9375-3.2812-3.2812,0,15.656-10.438,0,0-7.8125c0-1.4454-1.1484-2.625-2.5938-2.625s-2.625,1.1796-2.625,2.625v7.8125h-10.438v-15.656l-3.25,3.2812-3.9062-3.9375,20.22-20.18zm7.8125,2.625,5.2188,0,0,7.1562-5.2188-5.2187,0-1.9375z"/></g></svg>';
      return homeFolderIcon;      
    },

    // create label with SVG. legacy code in case i ever need it but now using the above fn makeLabelHtml since more efficient.
    makeLabelSvg: (opts) => {
      const dimensions = opts.dimensions;
      const buffer = opts.buffer || 4;
      const viewBoxRaw = '0 0 ' + dimensions.width + ' ' + dimensions.height;
      const viewBox = sticker.makeBufferedViewBox({buffer:buffer, bufferAllSides: true, viewBox: viewBoxRaw });
      let shapeObj = { x: 0,
                       y: 16, 
                       text: opts.label,
                       "font-size": 18,
                       width: dimensions.width,
                       height: dimensions.height,
                       stroke: opts.color,
                       fill: opts.color,
                       dashed: opts.dashed,
                       "stroke-width": opts.strokeWidth,
                       "fill-opacity":opts.fillOpacity
      };
      sticker.interpretDashing(opts, shapeObj);
      const theLabel = sticker.makeSvgElement('text', shapeObj);
      const parmBlock = {          
        el: theLabel,
        x: dimensions.x,
        y : dimensions.y,
        width: dimensions.width,
        height: dimensions.height,
        viewBox: viewBox,
      };

      const renderedSvg = sticker.renderSvg([parmBlock]);
      return renderedSvg;
    },

    makeCustom: (opts) => {
      const dimensions = opts.dimensions;
      let customHtml = '<img src="' + opts.imageUrl + '" style="width:' + dimensions.width + 'px;height:' + dimensions.height + 'px;' +
                       'top:' + dimensions.y + 'px;left:' + dimensions.x + 'px;opacity:1.0;';
      if (opts.cssTransform !== undefined) {
        customHtml += 'transform:' + opts.cssTransform;
      }
      customHtml += '">';

      return customHtml;
    },

  }

  sticker.minBracketWidth = 6;
  return (sticker);

});
