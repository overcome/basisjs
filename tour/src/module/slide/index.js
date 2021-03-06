var l10n = require('basis.l10n');
var router = require('basis.router');
var Dataset = require('basis.data').Dataset;
var Filter = require('basis.data.dataset').Filter;
var count = require('basis.data.index').count;
var Node = require('basis.ui').Node;
var VerticalPanelStack = require('basis.ui.panel').VerticalPanelStack;
var Resizer = require('basis.ui.resizer').Resizer;
var Menu = require('basis.ui.menu').Menu;
var Slide = require('app.type').Slide;

var fileList = require('./module/fileList/index.js');
var editor = require('./module/editor/index.js');
var timer;

fileList.selection.addHandler({
  itemsChanged: function(){
    editor.setDelegate(this.pick());
  }
});

var updateSet = new Dataset({
  listen: {
    item: {
      update: function(sender){
        if (!sender.data.updatable)
          panels.lastChild.prepareToRun();
      }
    }
  }
});
var changedFiles = new Filter({
  source: updateSet,
  ruleEvents: 'rollbackUpdate',
  rule: function(item){
    return item.modified;
  }
});

var langPopup = new Menu({
  childClass: {
    click: function(){
      l10n.setCulture(this.lang);
      langPopup.hide();
    }
  },
  childNodes: l10n.getCultureList().map(function(lang){
    return {
      caption: lang,
      lang: lang
    };
  })
});

var panels = new VerticalPanelStack({
  template: resource('./template/main-part.tmpl'),
  autoDelegate: true,
  childClass: {
    autoDelegate: true
  },
  childNodes: [
    {
      template: resource('./template/header.tmpl'),
      binding: {
        hasChanges: count(changedFiles),
        lang: l10n.culture
      },
      action: {
        resetSlide: function(){
          this.data.files.forEach(function(file){
            file.rollback();
          });
        },
        changeLang: function(event){
          langPopup.show(event.sender);
        }
      }
    },
    {
      template: resource('./template/files.tmpl'),
      childNodes: fileList
    },
    {
      flex: 1,
      template: resource('./template/code.tmpl'),
      childNodes: editor
    },
    {
      template: resource('./template/preview.tmpl'),
      handler: {
        update: function(){
          updateSet.set(this.data.files ? this.data.files.getItems() : []);
        },
        targetChanged: function(){
          if (this.target)
            this.run();
        }
      },
      prepareToRun: function(){
        if (timer)
          clearTimeout(timer);

        timer = setTimeout(this.run.bind(this), 500);
      },
      run: function(){
        timer = clearTimeout(timer);
        this.tmpl.launcher.src = 'launcher.html';

        var self = this;
        this.tmpl.set('reloaded', true);
        basis.nextTick(function(){
          self.tmpl.set('reloaded', false);
        });
      },

      init: function(){
        Node.prototype.init.call(this);
        this.resizer = new Resizer({
          property: 'height',
          factor: -1
        });
      },
      templateSync: function(){
        Node.prototype.templateSync.call(this);
        this.resizer.setElement(this.element);
      },
      destroy: function(){
        Node.prototype.destroy.call(this);
        this.resizer = this.resizer.destroy();
      }
    }
  ]
});

var view = new Node({
  autoDelegate: true,

  template: resource('./template/view.tmpl'),
  binding: {
    title: 'data:',
    description: {
      events: 'update',
      getter: function(node){
        return node.data.id
          ? l10n.dictionary('./slide/' + node.data.id + '/description.l10n').token('text')
          : null;
      }
    },

    num: 'data:',
    slideCount: count(Slide.all),

    panels: panels
  },
  action: {
    toc: function(){
      router.navigate('');
    },
    prev: function(){
      var prev = this.data.prev;
      router.navigate(prev ? prev.data.id : '');
    },
    next: function(){
      var next = this.data.next;
      router.navigate(next ? next.data.id : '');
    }
  },

  init: function(){
    Node.prototype.init.call(this);
    this.resizer = new Resizer();
  },
  templateSync: function(){
    Node.prototype.templateSync.call(this);
    this.resizer.setElement(this.tmpl.sidebar);
  },
  destroy: function(){
    Node.prototype.destroy.call(this);
    this.resizer = this.resizer.destroy();
  }
});

module.exports = view;
