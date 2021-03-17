# 🇩🇰 Copenhagen Editor

**Copenhagen** is a free, lightweight and hackable
open source code editor for the web. It's responsible for powering the
code-editing experience on [Autocode](https://autocode.com/),
and it's written entirely in vanilla JavaScript with only
[highlight.js](https://highlightjs.org/) and
[feather icons](https://feathericons.com) bundled as
dependencies.

You can play around with your own installation right away by forking this
repository in Autocode:

[<img src="https://open.autocode.com/static/images/open.svg?" width="192">](https://open.autocode.com/)

And documentation is available at [copenhagen.autocode.com](https://copenhagen.autocode.com).

# Getting Started

To get started with Copenhagen, add `copenhagen.0-1-0.min.css`
and `copenhagen.0-1-0.min.js` to your web project.
You can find them in this repository.
Then import them to your webpage by adding the following lines in the
`<head>` tag of your webpage:

```html
<!-- Copenhagen Editor -->
<link rel="stylesheet" href="./compiled/copenhagen.0-1-0.min.css">
<script src="./compiled/copenhagen.0-1-0.min.js"></script>
```

You can then instantiate a new Editor adding the following JavaScript
within a `<script>` tag:

```javascript
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
```

Alternatively, you can automatically convert all elements matching a
specific selector. This will automatically pass in config values
via `data-*` attributes on the HTML tag.

```html
<div class="editor" data-language="html" data-maxrows="20">
  // some code
</div>
```

```javascript
window.addEventListener('DOMContentLoaded', function () {
  var editors = Copenhagen.initSelectorAll('.editor');
});
```

# Documentation

Documentation is available at [copenhagen.autocode.com/docs.html](https://copenhagen.autocode.com/docs.html).

# Hacking the Editor, Contributing

Hacking the editor and making updates is simple. We recommend you install the
Autocode command line tools to get started.

[Autocode CLI, stdlib/lib on Github](https://github.com/stdlib/lib/)

Once installed, you can run your own local instance of the Autocode HTTP gateway
using;

```
$ lib http
```

And then visit `http://localhost:3434/dev/raw/` or `http://localhost:3434/dev/min/`
to play with the raw or minified compiled version of the editor. You can change
the editor code via the `src/` directory in this repository.

## Compiling Copenhagen

**You can only compile the editor when running locally**, this is not available
via the Autocode web interface because live web services run a read-only filesystem.

To compile changes to a single script / css file, simply run:

```
$ lib .compile --filename script.js --min t --write t
$ lib .compile --filename style.css --min t --write t
```

You can remove the `--min t` flag if you want to compile the non-minified versions.

# Development and license

The development of Copenhagen is funded by commercial interests and is
owned by Polybit Inc. DBA Autocode but is fully open source and MIT licensed.
We do not profit off of the development of Copenhagen directly; proceeds from
our commercial offering help fund its development.

# Updates and who to follow

You can follow Autocode team updates on Twitter at
[@AutocodeHQ](https://twitter.com/AutocodeHQ). The primary
author of Copenhagen is [@keithwhor (Keith Horwood)](https://twitter.com/keithwhor)
with the support of [@Hacubu (Jacob Lee)](https://twitter.com/Hacubu).
Special thanks to [@threesided (Scott Gamble)](https://twitter.com/threesided)
and [@YusufMusleh](https://twitter.com/yusufmusleh) for hundreds
of hours of testing in total, and thanks to our users and customers for
plenty of feedback. Enjoy Copenhagen, we sure have! 😎
