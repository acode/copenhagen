# Copenhagen Editor

# Getting Started

<p>
  To get started with Copenhagen, add <code>copenhagen.0-1-0.min.css</code>
  and <code>copenhagen.0-1-0.min.js</code> to your web project.
  You can find them <a href="https://github.com/acode/copenhagen/">on GitHub</a>.
  Then import them to your webpage by adding the following lines in the
  <code>&lt;head&gt;</code> tag of your webpage:
</p>

<div class="editor" data-language="html" data-maxrows="20">
  <!-- Copenhagen Editor -->
  &lt;link rel="stylesheet" href="./compiled/copenhagen.0-1-0.min.css"&gt;
  &lt;script src="./compiled/copenhagen.0-1-0.min.js"&gt;&lt;/script&gt;
</div>

<p>
  You can then instantiate a new Editor adding the following JavaScript
  within a <code>&lt;script&gt;</code> tag:
</p>

<div class="editor" data-language="javascript" data-maxrows="20">
  // Use DOMContentLoaded or whatever instantiation code you'd like,
  // just make sure the page is ready...
  window.addEventListener('DOMContentLoaded', function () {

    // instantiated CPHEditor instance with config
    var editor = new Copenhagen.Editor({language: 'javascript'});

    // open, but do not auto-focus the editor
    editor.open(this.selector('.some-selector'), false);

    // set a value
    editor.setValue('var message = `hello world`;');

  });
</div>

<p>
  Alternatively, you can automatically convert all elements matching a
  specific selector. This will automatically pass in config values
  via <code>data-*</code> attributes on the selector.
</p>

<div class="editor" data-language="html" data-maxrows="20">
  &lt;div class="editor" data-language="html" data-maxrows="20"&gt;
    // some code
  &lt;/div&gt;
</div>

<br>

<div class="editor" data-language="javascript" data-maxrows="20">
  window.addEventListener('DOMContentLoaded', function () {
    var editors = Copenhagen.initSelectorAll('.editor');
  });
</div>
