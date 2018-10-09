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

    makeLine: (opts) => {
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

    makeEllipse: (opts) => {
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
      const color = (opts.color === undefined ? '#000' : opts.color);
      const fill = (opts.fill === undefined ? 'none' : opts.fill);
      const strokeWidth = (opts.strokeWidth === undefined ? 3 : opts.strokeWidth);
      const thePath =
        svg.makeSvgElement('path',
                           {
                             'vector-effect': 'non-scaling-stroke',
                             'stroke-width' : strokeWidth,
                             stroke: color,
                             fill: fill,
                             d: opts.d,
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

    makeTopBracket: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 10 10',
          d: "M 0 10 L 0 0 L 10 0 L 10 10"
        })
      );
    },

    makeBottomBracket: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 10 10',
          d: "M 0 0 L 0 10 L 10 10 L 10 0"
        })
      );
    },

    makeRectangle: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 100',
          d: "M 0 0 L 0 100 L 100 100 L 100 0 Z"
        })
      );
    },

    makeRightTriangle: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 125',
          d: "M 0 125 L 100 125 L 100 0 Z"
        })
      );
    },

    makeIsocelesTriangle: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 100 125',
          d: "M 0 125 L 100 125 L 50 0 Z",
        })
      );
    },

    makeTheta: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          viewBox: '0 0 469 843.75',
          d: "M469 334c-2,440 -453,468 -469,2 -13,-435 472,-460 469,-2zm-383 -20l298 0c-9,-366 -288,-376 -298,-6l0 6zm297 46l-297 0c16,345 279,397 297,11 0,-4 0,-7 0,-11z",
          fill: 'fill',
        })
      );
    },

    makeSigma: (opts) => {
      return svg.makeSimplePath(
        $.extend(opts, {
          strokeWidth: 2,
          viewBox: '0 0 16 20',
          d: 'M2,1l5.46,7.27L2,15h12v-4h-1v1c0,0.552-0.448,1-1,1H4.97l4.39-5.52L5.25,2H12c0.552,0,1,0.448,1,1v1h1V1H2z',
          fill: 'fill',
        })
      );
    },

    makeStar: (opts) => {
      return svg.makeSimplePath(
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

  return (svg);

});





