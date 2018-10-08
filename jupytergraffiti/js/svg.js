define([], () => {
  // Thanks to https://stackoverflow.com/questions/3642035/jquerys-append-not-working-with-svg-element
  const svg = {
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
      let containerDiv, containerSvg;
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
          svg.makeDomElement('div',
                             {
                               'class':"graffiti-svg-inner",
                               'style' : 'position:absolute;' +
                                         'left:' + svgChild.x + 'px;top:' + svgChild.y + 'px;' +
                                         'width:' + svgChild.width + 'px;height:' + svgChild.height + 'px;' +
                                         transform
                             });
        containerSvg =
          svg.makeSvgElement('svg',
                             {
                               width: svgChild.width,
                               height: svgChild.height,
                               viewBox: svgChild.viewBox
                             });
        containerSvg.appendChild(svgChild.el);
        containerDiv.appendChild(containerSvg);
        svgGenerator[0].appendChild(containerDiv);
      }
      const containerHtml = svgGenerator[0].innerHTML;
      svgGenerator.empty();

      return containerHtml;
    },

    makeEllipse: (x,y,width,height) => {
    },

    makeRectangle: (x,y,width,height) => {
    },

    makeArrow: (x1,y1,x2,y2) => {
      // Cf : https://www.beyondjava.net/how-to-connect-html-elements-with-an-arrow-using-svg
      const arrowHeadDef =
        '<defs>' +
        '  <marker id="arrowHead" viewBox="0 0 10 10" refX="0" refY="5" markerUnits="strokeWidth" markerWidth="10" markerHeight="8" orient="auto">' +
        '    <path d="M 0 0 L 10 5 L 0 10 z"></path>' +
        '  </marker>' +
        '</defs>';
    },

    makeLeftBracket: (x, y, width,height) => {
    },

    makeRightBracket: (x, y, width,height) => {
    },

    // need to use html injection, not code generation to make stuff work,
    // cf my post: https://stackoverflow.com/questions/52675823/preserveaspectratio-ignored-by-code-generation-but-not-html-injection-for-svg-p

    makeRightCurlyBracePath: () => {
      const rightCurlyBracePath =
        svg.makeSvgElement('path',
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
      const rightCurlyBracePath = svg.makeRightCurlyBracePath();
      const renderedSvg = svg.renderSvg([
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
      const rightCurlyBracePath = svg.makeRightCurlyBracePath();
      const renderedSvg = svg.renderSvg([
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
      const curlyBracePath1 = svg.makeRightCurlyBracePath();
      const curlyBracePath2 = svg.makeRightCurlyBracePath();
      const renderedSvg = svg.renderSvg([
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
    makeCheckmark: (x, y, width, height) => {
      const viewBox = '0 0 587 783.75';
      const checkmarkPath =
        svg.makeSvgElement('path',
                           {
                             fill: "#00aa00",
                             "stroke-width":"4",
                             d: "M0 303c61,65 122,129 184,194 134,-166 227,-376 403,-497 -181,160 -285,402 -400,627 -62,-108 -125,-216 -187,-324z"
                           }
        );

      const renderedSvg = svg.renderSvg([
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
    makeX: (x, y, size) => {
      const viewBox = '0 0 233 291.25';
      const xPath =
        svg.makeSvgElement('polygon',
                           {
                             fill: "#aa0000",
                             points: "233,22 211,0 117,94 22,0 0,22 94,117 0,211 22,233 117,139 211,233 233,211 139,117"
                           }
        );

      const renderedSvg = svg.renderSvg([
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
      const thePath =
        svg.makeSvgElement('path',
                           {
                             'stroke-width' : opts.strokeWidth,
                             d: opts.d
                           });

      const renderedSvg = svg.renderSvg([
        {
          el: thePath,
          width: opts.width,
          height: opts.height,
          viewBox: opts.viewBox,
          x: opts.x,
          y : opts.y
        }
      ]);
      return renderedSvg;
    },

    makeRightTriangle: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 125',
          d: "M91,14.657V91H14.657L91,14.657 M95,5L5,95h90V5L95,5z"
        })
      );
    },

    makeIsocelesTriangle: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 125',
          d: "M50,11.708L90.146,92H9.854L50,11.708 M50,5L5,95h90L50,5L50,5z"
        })
      );
    },

    makeTheta: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 469 843.75',
          d: "M469 334c-2,440 -453,468 -469,2 -13,-435 472,-460 469,-2zm-383 -20l298 0c-9,-366 -288,-376 -298,-6l0 6zm297 46l-297 0c16,345 279,397 297,11 0,-4 0,-7 0,-11z"
        })
      );
    },

    makeSigma: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 16 20',
          d: 'M2,1l5.46,7.27L2,15h12v-4h-1v1c0,0.552-0.448,1-1,1H4.97l4.39-5.52L5.25,2H12c0.552,0,1,0.448,1,1v1h1V1H2z'
        })
      );
    },

  }

  return (svg);

});





