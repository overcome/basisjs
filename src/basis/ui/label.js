/*!
 * Basis javasript library 
 * http://code.google.com/p/basis-js/
 *
 * @copyright
 * Copyright (c) 2006-2011 Roman Dvornov.
 *
 * @license
 * GNU General Public License v2.0 <http://www.gnu.org/licenses/gpl-2.0.html>
 */

basis.require('basis.html');
basis.require('basis.dom');
basis.require('basis.data');
basis.require('basis.dom.wrapper');
basis.require('basis.ui');

!function(basis){

  'use strict';

 /**
  * @namespace basis.ui.label
  */

  var namespace = 'basis.ui.label';

  //
  // import names
  //

  var Class = basis.Class;
  var DOM = basis.dom;
  var Template = basis.html.Template;

  var getter = Function.getter;
  var createEvent = basis.EventObject.createEvent;

  var STATE = basis.data.STATE;

  var UINode = basis.ui.Node;


  //
  // main part
  //

  var stateTemplate = new Template(
    '<div{element|content} class="Basis-Label-State"/>'
  );
  var processingTemplate = new Template(
    '<div{element|content} class="Basis-Label-Processing"/>'
  );
  var errorTemplate = new Template(
    '<div{element|content} class="Basis-Label-Error"/>'
  );

  //
  // NodeLabel
  //

 /**
  * Base class for all labels.
  * @class
  */
  var NodeLabel = Class(UINode, {
    className: namespace + '.NodeLabel',

    cascadeDestroy: true,

    show_: false,
    visible_: false,
    visibilityGetter: Function.$false,

    insertPoint: DOM.INSERT_END,

    content: '[no text]',

    event_delegateChanged: function(object, oldDelegate){
      var newContainer = oldDelegate ? oldDelegate.element == this.container : !this.container;
      if (newContainer)
        this.setContainer(this.delegate && this.delegate.element);
    },
    event_visibilityChanged: createEvent('visibilityChanged'),

    init: function(config){
      var container = this.container;
      this.container = null;

      UINode.prototype.init.call(this, config);

      if (container)
        this.container = container;

      this.traceChanges_();

      return config;
    },

    traceChanges_: function(){
      if (this.container && this.visible_)
      {
        if (this.container != this.element.parentNode)
          DOM.insert(this.container, this.tmpl.element, this.insertPoint);
      }
      else
        DOM.remove(this.element);
    },

    setContainer: function(container){
      if (this.container != container)
      {
        this.container = container;
        this.traceChanges_()
      }
    },
    setVisibility: function(visible){
      if (this.visible_ != visible)
      {
        this.visible_ = visible;
        this.traceChanges_();
        this.event_visibilityChanged(this.visible_);
      }
    },

    destroy: function(){
      delete this.container;
      UINode.prototype.destroy.call(this);
    }
  });

  //
  // State labels
  //

 /**
  * Label that reacts on master node state changes.
  * @class
  */
  var State = Class(NodeLabel, {
    className: namespace + '.State',

    template: stateTemplate,

    init: function(config){
      if (this.visibleStates && !this.visibilityGetter)
      {
        var map = {};
        for (var state, i = 0; state = this.visibleStates[i++];)
          map[state] = true;
        this.visibilityGetter = getter(Function.$self, map);
      }

      NodeLabel.prototype.init.call(this, config);
    }
  });

  var ObjectState = Class(State, {
    className: namespace + '.ObjectState',

    event_stateChanged: function(object, oldState){
      State.prototype.event_stateChanged.call(this, object, oldState);
      this.setVisibility(this.visibilityGetter(this.state, oldState));
    }
  });

 /**
  * Label that shows only when delegate node in processing state.
  * @class
  */
  var Processing = Class(ObjectState, {
    className: namespace + '.Processing',

    visibilityGetter: function(newState){ 
      return newState == STATE.PROCESSING 
    },
    content: 'Processing...',
    template: processingTemplate
  });

  var Error = Class(ObjectState, {
    className: namespace + '.Error',

    visibilityGetter: function(newState){ 
      return newState == STATE.ERROR
    },
    content: 'Error',
    template: errorTemplate
  })

  //
  // Node dataSource state label
  //

  var DataSourceState_DataSourceHandler = {
    stateChanged: function(object, oldState){
      this.setVisibility(this.visibilityGetter(object.state, oldState));
    }
  };

  var DataSourceState_DelegateHandler = {
    dataSourceChanged: function(object, oldDataSource){
      if (oldDataSource)
        oldDataSource.removeHandler(DataSourceState_DataSourceHandler, this);

      if (object.dataSource)
      {
        object.dataSource.addHandler(DataSourceState_DataSourceHandler, this);
        DataSourceState_DataSourceHandler.stateChanged.call(this, object.dataSource, object.dataSource.state);
      }
    }
  };

 /**
  * @class
  */
  var DataSourceState = Class(State, {
    className: namespace + '.DataSourceState',

    event_delegateChanged: function(object, oldDelegate){
      State.prototype.event_delegateChanged.call(this, object, oldDelegate);

      if (oldDelegate)
        oldDelegate.removeHandler(DataSourceState_DelegateHandler, this);

      if (this.delegate)
      {
        this.delegate.addHandler(DataSourceState_DelegateHandler, this);
        DataSourceState_DelegateHandler.dataSourceChanged.call(this, this.delegate, oldDelegate && oldDelegate.dataSource);
      }
    },
    template: stateTemplate
  });

 /**
  * Label that shows only when delegate's dataSource in processing state.
  * @class
  */
  var DataSourceProcessing = Class(DataSourceState, {
    className: namespace + '.DataSourceProcessing',

    visibilityGetter: function(newState){ return newState == STATE.PROCESSING },
    content: 'Processing...',
    template: processingTemplate
  });

  //
  // Child nodes count labels
  //

  var CHILD_COUNT_FUNCTION = function(){
    this.setVisibility(this.visibilityGetter(this.delegate ? this.delegate.childNodes.length : 0, this.delegate));
  };

  var ChildCount_DataSourceHandler = {
    stateChanged: function(object, oldState){
      this.setVisibility(this.visibilityGetter(object.itemCount, this.delegate));
    }
  };

  var ChildCount_DelegateHandler = {
    childNodesModified: CHILD_COUNT_FUNCTION,
    dataSourceStateChanged: CHILD_COUNT_FUNCTION,
    stateChanged: CHILD_COUNT_FUNCTION,

    dataSourceChanged: function(object, oldDataSource){
      if (oldDataSource)
        oldDataSource.removeHandler(ChildCount_DataSourceHandler, this);

      if (object.dataSource)
      {
        object.dataSource.addHandler(ChildCount_DataSourceHandler, this);
        ChildCount_DataSourceHandler.stateChanged.call(this, object.dataSource, object.dataSource.state);
      }
    }
  };

 /**
  * @class
  */
  var ChildCount = Class(NodeLabel, {
    className: namespace + '.ChildCount',

    event_delegateChanged: function(object, oldDelegate){
      NodeLabel.prototype.event_delegateChanged.call(this, object, oldDelegate);

      if (oldDelegate)
        oldDelegate.removeHandler(ChildCount_DelegateHandler, this);

      if (this.delegate)
      {
        this.delegate.addHandler(ChildCount_DelegateHandler, this);
        ChildCount_DelegateHandler.dataSourceChanged.call(this, this.delegate);
      }

      CHILD_COUNT_FUNCTION.call(this);
    },
    template: new Template(
      '<div{element|content} class="Basis-CountLabel"/>'
    )
  });

 /**
  * @class
  */
  var IsEmpty = Class(ChildCount, {
    className: namespace + '.IsEmpty',

    visibilityGetter: function(childCount, object){ 
      var state = object.dataSource ? object.dataSource.state : object.state;
      return !childCount && state == STATE.READY;
    },
    content: 'Empty'
  })


  //
  // export names
  //

  basis.namespace(namespace).extend({
    NodeLabel: NodeLabel,
    State: State,
    ObjectState: ObjectState,
    Processing: Processing,
    Error: Error,
    DataSourceState: DataSourceState,
    DataSourceProcessing: DataSourceProcessing,
    ChildCount: ChildCount,
    IsEmpty: IsEmpty
  });

}(basis);