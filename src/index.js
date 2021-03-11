window['Copenhagen'] = {
  'Editor': CPHEditor,
  'initSelectorAll': function (selector) {
    return [].slice.call(document.querySelectorAll(selector)).map(function (el) {
      var language = el.getAttribute('data-language');
      var attrs = [].slice.call(el.attributes);
      var cfg = attrs
        .filter(function (a) { return a.nodeName.startsWith('data-'); })
        .reduce(function (cfg, a) {
          var key = a.nodeName.slice('data-'.length);
          var value = a.nodeValue;
          cfg[key] = value;
          return cfg;
        }, {});
      var editor = new CPHEditor(cfg);
      editor.open(el, false, true);
      return editor;
    });
  }
};
