const VERSION = 'v0.3.0';

const fs = require('fs');
const path = require('path');

const sass = require('node-sass');
const uglify = require('uglify-js');
const dot = require('dot');

function replaceStaticAssets (result) {
  return result
    .replace(
      /"\/static\/(.*?)"/gi,
      ($0, $1, $2) => `"${process.env.STATIC_ASSET_URL}${$1}"`
    )
    .replace(
      /'\/static\/(.*?)'/gi,
      ($0, $1, $2) => `'${process.env.STATIC_ASSET_URL}${$1}'`
    )
};

const BASE_DIR = './src';
const COMPILERS = {
  'script.js': (files, min) => {
    let data = files.map(f => f.value).join('\n');
    let templateData = compileTemplates();
    let result = `(function (window, document) {\n${[data, templateData].join('\n')}\n})(window, document);`;
    result = replaceStaticAssets(result);
    if (min) {
      result = uglify.minify(result);
      if (result.error) {
        let index = result.error.line - 2;
        let line = data.split('\n')[index];
        let errorMessage = [
          `Error parsing Javascript (${result.error.line}:${result.error.col})`,
          result.error.message
        ];
        let maxLength = Math.max.apply(null, errorMessage.map(line => line.length));
        errorMessage = errorMessage.map(line => line + ' '.repeat(Math.max(0, maxLength - line.length)));
        result = [
          `.-${'-'.repeat(maxLength)}-.`,
          `| ${errorMessage[0]} |`,
          `| ${errorMessage[1]} |`,
          `'-${'-'.repeat(maxLength)}-'`,
          data.split('\n').slice(Math.max(0, index - 5), index).join('\n'),
          '='.repeat(result.error.col) + 'v' + '='.repeat(line.length - result.error.col - 1 + 5),
          data.split('\n')[result.error.line - 2],
          '='.repeat(result.error.col) + '^' + '='.repeat(line.length - result.error.col - 1 + 5),
          data.split('\n').slice(index + 1, index + 5).join('\n')
        ].join('\n');
      } else {
        result = result.code;
      }
    }
    return formatOutput('script.js', result);
  },
  'style.css': (files, min, cachedValue) => {
    let data = files.map(f => f.value).join('\n');
    data = replaceStaticAssets(data);
    let result = sass.renderSync({
      data: data,
      outputStyle: min ? 'compressed' : 'nested',
    }).css.toString();
    return formatOutput('style.css', result);
  }
};

function formatOutput (name, body) {
  if (name === 'script.js') {
    return {
      headers: {
        'Content-Type': 'application/javascript'
      },
      body: body
    };
  } else if (name === 'style.css') {
    return {
      headers: {
        'Content-Type': 'text/css'
      },
      body: body
    };
  }
};

// include .min.js, .pack.js, etc. in packaging
var INCLUDED_NAMES = {
  'min': true,
  'pack': true
};

function readRecursive (pathname, ext, files) {
  files = files || [];
  let list = fs.readdirSync(pathname);
  let items = list.sort((a, b) => a.localeCompare(b)).reduce((items, filename) => {
    let fullpath = path.join(pathname, filename);
    if (fs.statSync(fullpath).isDirectory()) {
      items.dirs.push(fullpath);
    } else if (path.extname(fullpath) === ext) {
      let names = path.basename(fullpath).split('.');
      if (names.length === 3 && INCLUDED_NAMES[names[1]]) {
        items.files.push(fullpath);
      } else if (names.length == 2) {
        items.files.push(fullpath);
      }
    }
    return items;
  }, {files: [], dirs: []});
  items.files.forEach(fullpath => files.push({
    pathname: fullpath,
    filename: path.basename(fullpath),
    value: fs.readFileSync(fullpath).toString()
  }));
  items.dirs.forEach(fullpath => readRecursive(fullpath, ext, files));
  return files;
};

function compileTemplates () {
  let files = readRecursive(BASE_DIR, '.html');
  return files.map(f => `Template.add(${f.filename.split('.').slice(0, -1).join('')}, ${dot.template(f.value).toString()});`).join('\n');
};

var FILENAME_EXTENSIONS = {
  'script.js': '.js',
  'style.css': '.scss',
};

/**
* Loads all files
* @param {string} filename The filename to load
* @param {boolean} min Whether or not to minify the contents
* @param {boolean} write Whether or not to write the file contents to /www/compiled (NOTE: will only persist in local development)
* @returns {object.http} The http
*/
module.exports = async (filename, min = false, write = false, context) => {

  filename = filename || context.path.slice(2).join('/');

  if (!COMPILERS[filename]) {
    throw new Error(`No compiler found for "${filename}"`);
  } else {
    let response = COMPILERS[filename](readRecursive(BASE_DIR, FILENAME_EXTENSIONS[filename]), min);
    if (write) {
      let ext = filename.split('.').pop();
      let writename = min
        ? ['copenhagen', VERSION.replace(/\./gi, '-'), 'min', ext].join('.')
        : ['copenhagen', VERSION.replace(/\./gi, '-'), ext].join('.');
      fs.writeFileSync(path.join('./www/compiled/', writename), response.body);
    }
    return response;
  }

};
