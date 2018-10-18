define([], () => {
  // Thanks to https://stackoverflow.com/questions/3642035/jquerys-append-not-working-with-svg-element
  const sticker = {

    // Cf : https://www.beyondjava.net/how-to-connect-html-elements-with-an-arrow-using-svg
    generateArrowHeadElem: (color) => {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = sticker.makeSvgElement('marker', {
        id:'arrowHead',
        viewBox: '0 0 10 10',
        refX: 0,
        refY: 5,
        markerUnits: 'strokeWidth',
        markerWidth: '10',
        markerHeight: '8',
        orient: 'auto',
        stroke: color
      });
      const path = sticker.makeSvgElement('path', {
        d: "M 0 0 L 10 5 L 0 10 z"
      });
      marker.appendChild(path);
      defs.appendChild(marker);
      return defs;
    },
    
    /*
       const arrowHeadDef =
       '<defs>' +
       '  <marker id="arrowHead" viewBox="0 0 10 10" refX="0" refY="5" markerUnits="strokeWidth" markerWidth="10" markerHeight="8" orient="auto">' +
       '    <path d="M 0 0 L 10 5 L 0 10 z"></path>' +
       '  </marker>' +
       '</defs>';
       },
     */

    makeElementHtml: (tag, attr, innerHtml) => {
      let svgHtml = '<' + tag + ' ';
      if (tag === 'svg') {
        svgHtml += 'xmlns="http://www.w3.org/2000/svg" version="1.1" class="graffitiSvg" ';
      }
      let attrHtml = '';
      if (attr !== undefined) {
        attrHtml = $.map(attr, (val, key) => { return (key + '="' + val + '"') } ).join(' ');
      }
      if (innerHtml !== undefined) {
        svgHtml += attrHtml + '>' + innerHtml + '</' + tag + '>';
      } else {
        svgHtml += attrHtml + '></' + tag + '>';
      }
      return svgHtml;
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
      return el;
    },

    makeDomElement: (tag, attrs) => {
      const el= document.createElement(tag);
      for (let k in attrs) {
        el.setAttribute(k, attrs[k]);
      }
      return el;
    },

    renderSvg: (svgChildren, x, y, width, height, viewBox) => {
      let containerDiv, containerSticker;
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
        containerDiv =
          sticker.makeDomElement('div',
                             {
                               'class':"graffiti-sticker-inner",
                               'style' : 'position:absolute;' +
                                         'left:' + parseInt(svgChild.x) + 'px;top:' + parseInt(svgChild.y) + 'px;' +
                                         'width:' + parseInt(svgChild.width) + 'px;height:' + parseInt(svgChild.height) + 'px;' +
                                         transform
                             });
        containerSticker =
          sticker.makeSvgElement('svg',
                             {
                               width: svgChild.width,
                               height: svgChild.height,
                               viewBox: svgChild.viewBox
                             });
        if (svgChild.usesArrow) {
          containerSticker.appendChild(sticker.generateArrowHeadElem(svgChild.color));
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
      const bbox = [Math.min(opts.endpoints.p1.x, opts.endpoints.p2.x),
                       Math.min(opts.endpoints.p1.y, opts.endpoints.p2.y),
                       Math.max(opts.endpoints.p1.x, opts.endpoints.p2.x),
                       Math.max(opts.endpoints.p1.y, opts.endpoints.p2.y)
      ];
      const color = (opts.color === undefined ? '#000' : opts.color);
      const strokeWidth = (opts.strokeWidth === undefined ? 3 : opts.strokeWidth);
      const endpoints = opts.endpoints;
      let tmp;
      let arrowStatus = 'marker-end';
      if ((opts.endpoints.p1.x > opts.endpoints.p2.x) ||
          (opts.endpoints.p1.y > opts.endpoints.p2.y)) {
        tmp = opts.endpoints.p2.x;
        opts.endpoints.p2.x = opts.endpoints.p1.x;
        opts.endpoints.p1.x = tmp;
        tmp = opts.endpoints.p2.y;
        opts.endpoints.p2.y = opts.endpoints.p1.y;
        opts.endpoints.p1.y = tmp;
        arrowStatus = 'marker-start';
      }
      const coordSpaceEndpoints = [
        opts.endpoints.p1.x - bbox[0],
        opts.endpoints.p1.y - bbox[1],
        opts.endpoints.p2.x - bbox[0],
        opts.endpoints.p2.y - bbox[1]
      ];

      const pathPart = 'M ' + coordSpaceEndpoints[0] + ' ' + coordSpaceEndpoints[1] + ' ' +
                       'L ' + coordSpaceEndpoints[2] + ' ' + coordSpaceEndpoints[3];
      let pathObj = 
          {
          'vector-effect': 'non-scaling-stroke',
          'stroke-width' : strokeWidth,
          stroke: color,
          fill: 'none',
          d: pathPart
        };
      if (opts.usesArrow !== undefined) {
        pathObj[arrowStatus] =  'url(#arrowHead)';
      }
      if ((opts.dashed !== undefined) && (opts.dashed === 'dashed')) {
        if (opts.dashWidth) {
          pathObj['stroke-dasharray'] = opts.dashWidth;
        } else {
          pathObj['stroke-dasharray'] = 4;
        }
      }
      const line = sticker.makeSvgElement('path', pathObj);

      const arrowMargin = 15;
      const viewBox = [0,0,Math.abs(bbox[2]-bbox[0] + arrowMargin),Math.abs(bbox[3]-bbox[1]) + arrowMargin];
      const renderedSvg = sticker.renderSvg([
        {
          el: line,
          x: bbox[0],
          y: bbox[1],
          width: viewBox[2],
          height: viewBox[3],
          color: color,
          viewBox: viewBox.join(' '),
          usesArrow: opts.usesArrow
        }
      ]);

      console.log('bbox:', bbox, 'coordSpaceEndpoints', coordSpaceEndpoints, 'viewBox', viewBox, 'pathPart:', pathPart);
      return renderedSvg;
    },


    makeEllipse: (opts) => {
    },

    // need to use html injection, not code generation to make stuff work,
    // cf my post: https://stackoverflow.com/questions/52675823/preserveaspectratio-ignored-by-code-generation-but-not-html-injection-for-svg-p

    makeRightCurlyBracePath: () => {
      const rightCurlyBracePath =
        sticker.makeSvgElement('path',
                           {
                             fill: "none",
                             stroke: "#000",
                             "vector-effect": "non-scaling-stroke",
                             "stroke-width" : "3",
                             d: "M0,0 A100, 173.20508075688772 0 0 1  100, 173.20508075688772 A100, " +
                                "173.20508075688772 0 0 0 200 346.41016151377545 A100, " +
                                "173.20508075688772 0 0 0 100, 519.6152422706632 A100, " +
                                "173.20508075688772 0 0 1 0, 692.8203230275509"
                           }
        );
      return rightCurlyBracePath;
    },

    makeLeftCurlyBrace: (x, y, height) => {
      const curlyViewBox = '0 0 200 692';
      const rightCurlyBracePath = sticker.makeRightCurlyBracePath();
      const renderedSvg = sticker.renderSvg([
        {
          el: rightCurlyBracePath,
          width: 8,
          height: height,
          viewBox: curlyViewBox,
          x: x,
          y : y,
          cssTransform: "scaleX(-1)" // css transform
        }
      ]);
      return renderedSvg;
    },

    makeRightCurlyBrace: (x, y, height) => {
      const curlyViewBox = '0 0 200 692';
      const rightCurlyBracePath = sticker.makeRightCurlyBracePath();
      const renderedSvg = sticker.renderSvg([
        {
          el: rightCurlyBracePath,
          width: 8,
          height: height,
          viewBox: curlyViewBox,
          x: x,
          y : y
        }
      ]);
      return renderedSvg;
    },

    makeSymmetricCurlyBraces: (x, y, width, height) => {
      const curlyViewBox = '0 0 200 692';
      const curlyBracePath1 = sticker.makeRightCurlyBracePath();
      const curlyBracePath2 = sticker.makeRightCurlyBracePath();
      const renderedSvg = sticker.renderSvg([
        {
          el: curlyBracePath1,
          width: 8,
          height: height,
          viewBox: curlyViewBox,
          x: 0,
          y : 0,
          cssTransform: "scaleX(-1)" // css transform
        },
        {
          el: curlyBracePath2,
          width: 8,
          height: height,
          viewBox: curlyViewBox,
          x: width - 10,
          y : 0
        }
      ]);
      //console.log(renderedSvg);
      return renderedSvg;
    },

    // checkmark
    makeCheckmark: (x, y, width, height, color) => {
      const viewBox = '0 0 587 783.75';
      const checkmarkPath =
        sticker.makeSvgElement('path',
                           {
                             fill: '#' + color,
                             "stroke-width":"4",
                             d: "M0 303c61,65 122,129 184,194 134,-166 227,-376 403,-497 -181,160 -285,402 -400,627 -62,-108 -125,-216 -187,-324z"
                           }
        );

      const renderedSvg = sticker.renderSvg([
        {
          el: checkmarkPath,
          width: width,
          height: height,
          viewBox: viewBox,
          x: x,
          y : y
        }
      ]);
      return renderedSvg;
    },

    // x (wrong) symbol
    makeX: (x, y, size, color) => {
      const viewBox = '0 0 233 291.25';
      const xPath =
        sticker.makeSvgElement('polygon',
                           {
                             fill: '#' + color,
                             points: "233,22 211,0 117,94 22,0 0,22 94,117 0,211 22,233 117,139 211,233 233,211 139,117"
                           }
        );

      const renderedSvg = sticker.renderSvg([
        {
          el: xPath,
          width: size,
          height: size,
          viewBox: viewBox,
          x: x,
          y : y
        }
      ]);
      return renderedSvg;
    },

    makeSimplePath: (opts) => {
      const viewBox = opts.viewBox;
      const color = (opts.color === undefined ? '#000' : opts.color);
      const fill = (opts.fill === undefined ? 'none' : opts.fill);
      const strokeWidth = (opts.strokeWidth === undefined ? 3 : opts.strokeWidth);
      let pathObj = 
        {
          'vector-effect': 'non-scaling-stroke',
          'stroke-width' : strokeWidth,
          stroke: color,
          fill: fill,
          d: opts.d,
        };

      if ((opts.dashed !== undefined) && (opts.dashed === 'dashed')) {
        if (opts.dashWidth) {
          pathObj['stroke-dasharray'] = opts.dashWidth;
        } else {
          pathObj['stroke-dasharray'] = 4;
        }
      }

      const thePath = sticker.makeSvgElement('path',pathObj);

      const renderedSvg = sticker.renderSvg([
        {
          el: thePath,
          x: opts.dimensions.x,
          y : opts.dimensions.y,
          width: opts.dimensions.width,
          height: opts.dimensions.height,
          viewBox: opts.viewBox
        }
      ]);
      return renderedSvg;
    },

    makeTopBracket: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 10 10',
          d: "M 0 10 L 0 0 L 10 0 L 10 10"
        })
      );
    },

    makeBottomBracket: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 10 10',
          d: "M 0 0 L 0 10 L 10 10 L 10 0"
        })
      );
    },

    makeLeftBracket: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 10 10',
          d: "M 10 10 L 0 10 L 0 0 L 10 0"
        })
      );
    },

    makeRightBracket: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 10 10',
          d: "M 0 0 L 10 0 L 10 10 L 0 10"
        })
      );
    },

    makeHorizontalBrackets: (opts) => {
    },

    makeVerticalBrackets: (opts) => {
    },

    makeRectangle: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 100',
          d: "M 0 0 L 0 100 L 100 100 L 100 0 Z"
        })
      );
    },

    makeRightTriangle: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 125',
          d: "M 0 125 L 100 125 L 100 0 Z"
        })
      );
    },

    makeIsocelesTriangle: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 125',
          d: "M 0 125 L 100 125 L 50 0 Z",
        })
      );
    },

    makeTheta: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 469 843.75',
          d: "M469 334c-2,440 -453,468 -469,2 -13,-435 472,-460 469,-2zm-383 -20l298 0c-9,-366 -288,-376 -298,-6l0 6zm297 46l-297 0c16,345 279,397 297,11 0,-4 0,-7 0,-11z",
          fill: 'fill',
        })
      );
    },

    makeSigma: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 16 20',
          d: 'M2,1l5.46,7.27L2,15h12v-4h-1v1c0,0.552-0.448,1-1,1H4.97l4.39-5.52L5.25,2H12c0.552,0,1,0.448,1,1v1h1V1H2z',
          fill: 'fill',
        })
      );
    },

    makeSmiley: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 50 62.5',
          d: 'M25,1A24,24,0,1,0,49,25,24,24,0,0,0,25,1Zm0,46A22,22,0,1,1,47,25,22,22,0,0,1,25,47ZM35.77,33.32a1,1,0,0,1-.13,1.41C31.73,38,28.06,39.1,24.9,39.1a16,16,0,0,1-10.63-4.45,1,1,0,0,1,1.45-1.38c0.34,0.35,8.35,8.52,18.63-.08A1,1,0,0,1,35.77,33.32ZM15,19a3,3,0,1,1,3,3A3,3,0,0,1,15,19Zm14,0a3,3,0,1,1,3,3A3,3,0,0,1,29,19Z',
          fill: 'none',
        })
      );
    },

    makeFrowney: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 100 125',
          d: 'M50,2.5C23.809,2.5,2.5,23.809,2.5,50S23.809,97.5,50,97.5S97.5,76.191,97.5,50S76.191,2.5,50,2.5z M50,91.684    C27.016,91.684,8.316,72.984,8.316,50S27.016,8.316,50,8.316S91.684,27.016,91.684,50S72.984,91.684,50,91.684z M37.489,41.386    c2.964,0,5.369-2.403,5.369-5.369c0-2.966-2.405-5.368-5.369-5.368c-2.966,0-5.369,2.402-5.369,5.368    C32.12,38.982,34.523,41.386,37.489,41.386z M62.511,41.386c2.965,0,5.369-2.403,5.369-5.369c0-2.966-2.404-5.368-5.369-5.368    c-2.966,0-5.368,2.402-5.368,5.368C57.143,38.982,59.545,41.386,62.511,41.386z M50.001,51.186    c-13.939,0-20.525,9.548-22.06,14.597c-0.467,1.537,0.399,3.161,1.936,3.628c1.539,0.471,3.161-0.399,3.628-1.936    c0.032-0.105,3.336-10.473,16.496-10.473c13.015,0,16.363,10.061,16.494,10.472c0.381,1.255,1.534,2.063,2.781,2.063    c0.28,0,0.564-0.04,0.846-0.127c1.538-0.467,2.405-2.091,1.938-3.627C70.524,60.733,63.939,51.186,50.001,51.186z',
          fill: 'none',
        })
      );
    },

    makeThumbsUp: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 218 346.25',
          d: 'M28 263l31 -9c64,42 77,13 92,10 4,0 1,4 17,0 22,-7 31,-19 23,-35 19,-6 21,-18 15,-33 15,-9 15,-26 3,-38 19,-37 -11,-67 -80,-48 -5,-36 11,-59 5,-80 -7,-27 -25,-31 -50,-30 3,68 8,35 -25,101 -27,55 -3,48 -57,63 -6,36 4,70 26,99zm4 -12c-16,-24 -23,-49 -21,-77 48,-14 33,-15 57,-65 33,-71 31,-34 27,-97 31,1 32,26 26,50 -7,27 -6,40 -1,62 26,-7 74,-21 82,6 7,27 -22,40 -35,41l-42 -7c9,-28 36,-19 44,-19l10 -3 7 -13c-29,8 -10,3 -31,4 -24,1 -40,15 -43,40l8 1c-8,7 -13,16 -14,28l9 1c-5,6 -10,15 -12,26l14 3c-5,7 -9,15 -11,26l29 4c-29,10 -50,-1 -74,-20l-29 9zm87 -58c12,-30 27,-10 49,-12 5,0 27,-7 33,-14 24,20 -36,32 -39,33l-43 -7zm-2 27l10 -15c44,7 28,8 70,-4 10,19 -35,26 -35,26l-45 -7zm3 30l9 -17c36,5 26,7 53,0 4,16 -17,22 -23,22l-39 -5z',
          fill: 'fill',
        })
      );
    },

    makeThumbsDown: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 226 357.5',
          d: 'M18 27l33 4c59,-51 77,-23 92,-23 5,0 0,-4 18,-2 23,3 33,15 28,32 20,4 24,15 20,32 17,7 19,23 8,37 25,36 -1,70 -74,60 0,38 19,59 16,82 -3,27 -21,34 -46,37 -6,-70 3,-37 -40,-99 -35,-52 -10,-48 -67,-56 -11,-36 -6,-71 12,-104zm6 12c-13,26 -16,53 -10,81 51,7 35,11 67,58 44,66 36,29 41,95 32,-7 29,-32 19,-55 -11,-27 -11,-40 -9,-63 27,4 78,10 82,-18 4,-28 -28,-37 -41,-36l-42 13c13,27 39,14 48,13l10 1 9 12c-30,-4 -10,-1 -33,1 -23,2 -41,-9 -49,-34l8 -3c-8,-6 -15,-14 -18,-26l9 -3c-6,-5 -11,-13 -16,-24l15 -5c-7,-6 -12,-15 -15,-25l28 -8c-30,-7 -50,8 -72,30l-31 -4zm96 46c17,28 30,7 52,5 6,-1 29,4 36,9 21,-23 -42,-27 -44,-27l-44 13zm-5 -27l12 14c44,-13 27,-12 72,-6 7,-21 -39,-22 -40,-22l-44 14zm-1 -31l11 16c36,-11 26,-11 54,-7 2,-18 -20,-20 -27,-20l-38 11z',
          fill: 'fill',
        })
      );
    },


    makeStar: (opts) => {
      return sticker.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 1024 1280',
          d:
            'M521.19122173 257.59668148l48.67463902 112.36592198c10.61521383 24.46677333 33.65799506 41.42522469 60.32548344 44.14375505l123.62840495 12.55702124-92.30057877 79.48464988c-20.71261235 17.86462815-29.90383408 45.43829333-23.8195042 72.10578173l27.44421136 121.68659752-105.37541531-64.20909827c-11.52139061-6.99050667-24.85513482-10.74466765-38.31833283-10.74466765-13.59265185 0-26.79694222 3.75416098-38.31833286 10.74466765l-105.37541529 64.20909827 27.44421135-121.68659752c5.95487605-26.66748839-3.10689185-54.24115358-23.8195042-72.10578173l-92.30057876-79.48464988 123.62840494-12.55702124c26.53803457-2.71853037 49.71026963-19.5475279 60.32548346-44.14375505l48.1568237-112.36592198m0-117.80298272c-6.2137837 0-12.55702124 3.3657995-15.40500543 10.09739852l-85.43952593 197.28763258c-2.45962272 5.56651457-7.63777581 9.45012939-13.72210568 10.09739853l-216.446799 22.00715063c-14.7577363 1.55344592-20.45370469 19.80643555-9.32067556 29.51547258l163.11182222 140.45740248c4.66033778 4.01306864 6.86105283 10.35630617 5.43706074 16.44063605l-48.1568237 213.98717629c-2.58907653 11.26248297 6.34323753 20.58315852 16.44063604 20.58315852 2.84798419 0 5.95487605-0.77672297 8.67340642-2.45962272l186.15460346-113.40155259c2.71853037-1.68289975 5.69596839-2.45962272 8.80286024-2.45962272s6.08432987 0.77672297 8.80286026 2.45962272l186.15460344 113.40155259c2.84798419 1.68289975 5.82542222 2.45962272 8.67340644 2.45962272 10.09739852 0 19.02971259-9.32067555 16.44063604-20.58315852L693.23535803 565.69679013c-1.4239921-6.08432987 0.77672297-12.42756741 5.43706073-16.44063605l163.11182222-140.45740248c11.26248297-9.70903703 5.43706075-27.96202667-9.32067555-29.51547258l-216.44679901-22.00715063c-6.08432987-0.64726914-11.26248297-4.40143013-13.72210567-10.09739853l-85.43952593-197.28763258c-3.23634569-6.73159902-9.45012939-10.09739852-15.66391309-10.09739852z',
          fill: 'fill',
        })
      );
    },

  }

  return (sticker);

});
