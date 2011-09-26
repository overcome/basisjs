
  (function(){

    // namespace

    var namespace = 'BasisDoc.Nav';

    //
    // import names
    //

    var Class = basis.Class;
    var DOM = basis.dom;

    var getter = Function.getter;
    var classList = basis.cssom.classList;

    var nsWrappers = basis.dom.wrapper;
    var nsTree = basis.ui.tree;
    var nsCore = BasisDoc.Core;
    var nsView = BasisDoc.View;

    //
    // Maps
    //

    var kindNodeType = {
      'namespace': 'Namespace',
      'method': 'Method',
      'function': 'Function',
      'property': 'Property',
      'classMember': 'ClassMember',
      'constant': 'Constant',
      'htmlElement': 'HtmlElement',
      'class': 'Class',
      'object': 'Object',
      'event': 'Event'
    };

    var groupTitle = {
      Namespace: 'Namespaces',
      Method: 'Methods',
      Function: 'Functions',
      Property: 'Properties',
      Constant: 'Constants',
      Class: 'Classes',
      Object: 'Objects',
      HtmlElement: 'DOM elements',
      ClassMember: 'Class members',
      Event: 'Events'
    };

    var groupWeight = {
      Namespace: 0,
      ClassMember: 1,
      Constant: 2,
      Class: 3,
      Object: 4,
      HtmlElement: 5,
      Event: 6,
      Property: 7,
      Method: 8,
      Function: 9
    };

    var nodeTypeGrouping = {
      groupGetter: function(node){
        return node.data.isClassMember ? 'ClassMember' : node.nodeType;
      },
      titleGetter: getter('data.id', groupTitle),
      localSorting: getter('data.id', groupWeight)
    };

    //
    // Base navigation tree child node classes
    //

    //
    // Nodes
    //

   /**
    * @class
    */
    var BaseDocTreeNode = Class(nsTree.Node, {
      views: [],

      init: function(config){
        nsTree.Node.prototype.init.call(this, config);

        this.tmpl.title.href = '#' + this.data.fullPath;
        classList(this.tmpl.content).add(this.nodeType + '-Content');
      }
    });

   /**
    * @class
    */
    var docFunction = Class(BaseDocTreeNode, {
      nodeType: 'Function',

      views: [
        nsView.viewSourceCode
      ],

      init: function(config){
        BaseDocTreeNode.prototype.init.call(this, config);

        DOM.insert(this.tmpl.title, DOM.createElement('SPAN.args', '(', this.tmpl.argsText = DOM.createText(), ')'))
        this.tmpl.argsText.nodeValue = nsCore.getFunctionDescription(this.data.obj).args;
      }
    });

   /**
    * @class
    */
    var docMethod = Class(docFunction, {
      nodeType: 'Method',

      views: [
        nsView.viewInheritance,
        nsView.viewSourceCode
      ]
    });

   /**
    * @class
    */
    var docEvent = Class(docFunction, {
      nodeType: 'Event',

      views: [
        nsView.viewInheritance,
        nsView.viewSourceCode
      ]
    });

   /**
    * @class
    */
    var docProperty = Class(BaseDocTreeNode, {
      nodeType: 'Property',

      views: [
        nsView.viewInheritance
      ]
    });

   /**
    * @class
    */
    var docClassMember = Class(BaseDocTreeNode, {
      nodeType: 'ClassMember'
    });

   /**
    * @class
    */
    var docConstant = Class(BaseDocTreeNode, {
      nodeType: 'Constant'
    });

   /**
    * @class
    */
    var docHtmlElement = Class(BaseDocTreeNode, {
      nodeType: 'HtmlElement'
    });


    //
    // Folders
    //

   /**
    * @class
    */
    var BaseDocTreeFolder = Class(nsTree.Folder, {
      collapsed: true,

      childFactory: function(config){
        return new kindNodeClass[config.delegate.data.kind](config);
      },
      localSorting: function(node){
        return groupWeight[node.nodeType] + '_' + node.data.title;
      },
      localGrouping: nodeTypeGrouping,

      init: function(config){
        BaseDocTreeNode.prototype.init.call(this, config);

        if (this.collapsed)
          this.event_collapse();
      },

      getMembers: function(){
        return nsCore.getMembers(this.data.fullPath);
      },
      expand: function(){
        if (nsTree.Folder.prototype.expand.call(this))
        {
          this.setChildNodes(this.getMembers());
          this.expand = nsTree.Folder.prototype.expand;
        }
      }
    });

   /**
    * @class
    */
    var docSection = Class(BaseDocTreeFolder, {
      nodeType: 'Section',

      collapsed: false,
      selectable: false,
      localGrouping: false,
      expand: nsTree.Folder.prototype.expand
    });

   /**
    * @class
    */
    var docNamespace = Class(BaseDocTreeFolder, {
      nodeType: 'Namespace'
    });

   /**
    * @class
    */
    var docObject = Class(BaseDocTreeFolder, {
      nodeType: 'Object'
    });

   /**
    * @class
    */
    var docClass = Class(BaseDocTreeFolder, {
      nodeType: 'Class',

      views: [
        nsView.viewClassMap,
        nsView.viewInheritance,
        nsView.viewTemplate,
        //nsView.viewConstructor,
        nsView.viewPrototype
      ],

      init: function(config){
        BaseDocTreeFolder.prototype.init.call(this, config);

        DOM.insert(this.tmpl.title, DOM.createElement('SPAN.args', '(', this.tmpl.argsText = DOM.createText(), ')'))
        this.tmpl.argsText.nodeValue = nsCore.getFunctionDescription(this.data.obj).args;
      },
      getMembers: function(){
        return [
          nsCore.getMembers(this.data.fullPath + '.prototype'),
          nsCore.getMembers(this.data.fullPath).map(function(item){ item.data.isClassMember = true; return item; })
        ].flatten();
      }
    });

    //
    // map node type -> tree child class
    //

    var kindNodeClass = {
      'namespace': docNamespace,
      'method': docMethod,
      'event': docEvent,
      'function': docFunction,
      'property': docProperty,
      'classMember': docClassMember,
      'constant': docConstant,
      'htmlElement': docHtmlElement,
      'class': docClass,
      'object': docObject
    };


    //
    // export names
    //

    basis.namespace(namespace).extend({
      nodeTypeGrouping: nodeTypeGrouping,
      docClass: docClass,
      docNamespace: docNamespace,
      docSection: docSection,
      kindNodeType: kindNodeType
    });

  })();
