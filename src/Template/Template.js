function Template (fn) { this._render = typeof fn === 'function' ? fn : function () { return ''; }; }
Template.prototype.render = function (control, it) { return this._render.call(control, it); };
Template._templates = {};
Template.find = function (Control) { var template = Template._templates[Control.name]; if (!template) { throw new Error('Could not find template: "' + name + '"'); } return template; };
Template.add = function (Control, fn) { Template._templates[Control.name] = new Template(fn); };
