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

'use strict';

  (function(){

    /** @namespace Basis.Ajax */

    var namespace = 'Basis.Ajax';

    // import names

    var Class = Basis.Class;
    var Event = Basis.Event;

    var Browser = Basis.Browser;
    var Cookies = Browser.Cookies;
    var Cleaner = Basis.Cleaner;

    var TimeEventManager = Basis.TimeEventManager;

    var nsData = Basis.Data;
    var nsWrappers = Basis.DOM.Wrapper;

    var DataObject = nsData.DataObject;
    var EventObject = Basis.EventObject;

    var STATE = nsData.STATE;





    //
    // Main part
    //

    // const

    /** @const */ var STATE_UNSENT = 0;
    /** @const */ var STATE_OPENED = 1;
    /** @const */ var STATE_HEADERS_RECEIVED = 2;
    /** @const */ var STATE_LOADING = 3;
    /** @const */ var STATE_DONE = 4;

    var IS_POST_REGEXP = /POST/i;

    var DEBUG_MODE = Cookies.get('DEBUG_AJAX');

    // base 
    var DEFAULT_METHOD = 'GET';
    var DEFAULT_CONTENT_TYPE = 'application/x-www-form-urlencoded';

    // TODO: better debug info out
    var logOutput = typeof console != 'undefined' ? function(){ console.log(arguments) } : Function.$self;

    // Encode
    var CodePages = {};
    var Encode = {
      escape: function(string, codepage){
        var table = (CodePages[codepage] || codepage || CodePages.win1251).escape;
        return escape(String(string)).replace(/%u0([0-9a-f]{3})/gi, 
                                              function(match, code) { return table[code.toUpperCase()] || match });
      },
      unescape: function(string, codepage){
        var table = (CodePages[codepage] || codepage || CodePages.win1251).unescape;
        return unescape(String(string).replace(/%([0-9a-f]{2})/gi, 
                                               function(match, code){ return table[code.toUpperCase()] || match }));
      }
    };

    // Windows 1251
    (function(){
      var w1251 = CodePages.win1251 = { escape: {}, unescape: {} };
      w1251.escape['401']  = '%A8'; // `E' - e kratkoe
      w1251.unescape['A8'] = 0x401; // `E'
      w1251.escape['451']  = '%B8'; // `e'
      w1251.unescape['B8'] = 0x451; // `e'

      for (var i = 0xC0; i <= 0xFF; i++) // A-YAa-ya
      {
        w1251.unescape[i.toHex()] = String.fromCharCode(i + 0x350); 
        w1251.escape[(i + 0x350).toHex()] = '%' + i.toHex();
      }
    })();


   /**
    * @function createTransport
    * Creates transport constructor
    */
    var XHRSupport = 'native';
    var createXmlHttpRequest = function(){

      if (window.XMLHttpRequest)
        return function(){
          return new XMLHttpRequest();
        };

      var ActiveXObject = window.ActiveXObject;
      if (ActiveXObject)
      {
        var progID = [
          "MSXML2.XMLHTTP.6.0",
          "MSXML2.XMLHTTP.3.0",
          "MSXML2.XMLHTTP",
          "Microsoft.XMLHTTP"
        ];

        for (var i = 0, fn; XHRSupport = progID[i]; i++)
          try {
            if (new ActiveXObject(XHRSupport))
              return function(){
                return new ActiveXObject(XHRSupport);
              };
          } catch(e) {}
      }

      throw new Error(XHRSupport = 'Browser doesn\'t support for XMLHttpRequest!');

    }();

   /**
    * Sets transport request headers
    * @private
    */
    function setRequestHeaders(request, requestData){
      var headers = {
        'JS-Framework': 'Basis'
      };

      if (IS_POST_REGEXP.test(requestData.method)) 
      {
        headers['Content-Type'] = requestData.contentType + (requestData.encoding ? '\x3Bcharset=' + requestData.encoding : '');
        if (Browser.test('gecko'))
          headers['Connection'] = 'close';
      }
      else
        if (Browser.test('ie')) // disable IE caching
          headers['If-Modified-Since'] = new Date(0).toGMTString();

      Object.iterate(Object.extend(headers, requestData.headers), function(key, value){
        if (value != null)
          this.setRequestHeader(key, value);
      }, request);
    };


   /**
    * readyState change handler
    * private method
    * @function readyStateChangeHandler
    */
    function readyStateChangeHandler(readyState){
      var xhr = this.xhr;
      if (!xhr)
        return;

      var proxy = this.proxy;

      if (typeof readyState != 'number')
        readyState = xhr.readyState;

      // BUGFIX: IE & Gecko fire OPEN readystate twice
      if (readyState == this.prevReadyState_)
        return;

      ;;;if (this.debug) logOutput('State: (' + readyState + ') ' + ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'][readyState]);

      // dispatch self event
      proxy.event_readyStateChanged(this, readyState);

      var newState;
      var error;

      if (readyState == STATE_UNSENT)
      {
        // dispatch event
        proxy.event_abort(this);
        proxy.event_complete(this);

        newState = STATE.READY; 

        ;;;if (this.debug) logOutput('Request aborted');
      }
      else if (readyState == STATE_DONE)
      {
        TimeEventManager.remove(this, 'timeoutAbort');
        // clean event handler
        xhr.onreadystatechange = Function.$undef;

        this.processResponse();

        // dispatch events
        if (this.isSuccessful())
        {
          proxy.event_success(this);
          newState = STATE.READY;
        }
        else
        {
          this.processErrorResponse();

          proxy.event_failure(this);
          newState = STATE.ERROR;
        }

        // dispatch status
        proxy.event_httpStatus(this, xhr.status);

        // dispatch complete event
        proxy.event_complete(this);
      }
      else
        newState = STATE.PROCESSING;

      // set new state
      this.setState(newState, this.info.error);

      this.prevReadyState_ = readyState;
    };

    /**
     * @class Request
     */

    var AjaxRequest = Class(DataObject, {
      timeout:  30000, // 30 sec
      requestStartTime: 0,

      //prepare: Function.$true,

      event_stateChanged: function(object, oldState){
        DataObject.prototype.event_stateChanged.call(this, object, oldState);

        for (var i = 0; i < this.influence.length; i++)
          this.influence[i].setState(this.state, this.state.data);
      },

      init: function(config){
        DataObject.prototype.init.call(this, config);
        this.xhr = createXmlHttpRequest();
        this.influence = [];
      },

      setInfluence: function(influence){
        this.influence = Array.from(influence);
      },
      clearInfluence: function(){
        this.influence = [];
      },

      isIdle: function(){
        return this.xhr.readyState == STATE_DONE || this.xhr.readyState == STATE_UNSENT;
      },

      isSuccessful: function(){
        try {
          var status = this.xhr.status;
          return (status == undefined)
              || (status == 0)
              || (status >= 200 && status < 300);
        } catch(e) {
        }
        return false;
      },

      processResponse: function(){
        this.update({
          responseText: this.xhr.responseText,
          responseXML: this.xhr.responseXML
        });
      },

      processErrorResponse: function(){
        this.update({
          error: {
            code: 'SERVER_ERROR',
            msg: req.responseText
          }
        });
      },

      prepare: function(requestData){
        this.update({
          responseText: '',
          responseXML: ''
        });

        var params = Object.iterate(requestData.params, function(key, value){
          return (value == null) || (value && typeof value.toString == 'function' && value.toString() == null)
            ? null
            : key + '=' + String(value.toString()).replace(/[\%\=\&\<\>\s\+]/g, function(m){ var code = m.charCodeAt(0).toHex(); return '%' + (code.length < 2 ? '0' : '') + code })//Encode.escape(Basis.Crypt.UTF8.fromUTF16(value.toString()))
        }).filter(Function.$isNotNull).join('&');

        // prepare location & postBody
        if (IS_POST_REGEXP.test(requestData.method))
        {
          requestData.postBody = requestData.postBody || params || '';
        }
        else
        {
          if (params)
            requestData.url += (requestData.url.indexOf('?') == -1 ? '?' : '&') + params;
        }

        return requestData;
      },

      doRequest: function(requestData){
        this.requestData = requestData;

        if (requestData = this.prepare(requestData))
          this.send(requestData);
      },
      
      send: function(requestData){
        // create new XMLHTTPRequest instance for gecko browsers in asynchronous mode
        // object crash otherwise
        if (Browser.test('gecko1.8.1-') && requestData.asynchronous)
        {
          ;;;if (typeof console != 'undefined') console.info('Recreate transport (fix for current gecko version)');
          this.xhr = createXmlHttpRequest();
        }

        this.proxy.event_start(this);

        var xhr = this.xhr;

        this.prevReadyState_ = -1;

        if (requestData.asynchronous)
          // set ready state change handler
          xhr.onreadystatechange = readyStateChangeHandler.bind(this);
        else
          // catch state change for 'loading' in synchronous mode
          readyStateChangeHandler.call(this, STATE_UNSENT);

        // open XMLHttpRequest
        xhr.open(requestData.method, requestData.url, requestData.asynchronous);

        // set headers
        setRequestHeaders(xhr, requestData);

        // save transfer start point time & set timeout
        this.requestStartTime = Date.now();
        TimeEventManager.add(this, 'timeoutAbort', this.requestStartTime + this.timeout);

        // prepare post body
        var postBody = requestData.postBody;

        // BUGFIX: IE fixes for post body
        if (requestData.method == 'POST' && Browser.test('ie9-'))
        {
          if (typeof postBody == 'object' && typeof postBody.documentElement != 'undefined' && typeof postBody.xml == 'string')
            // sending xmldocument content as string, otherwise IE override content-type header
            postBody = postBody.xml;                   
          else
            if (typeof postBody == 'string')
              // ie stop send postBody when found \r
              postBody = postBody.replace(/\r/g, ''); 
            else
              if (postBody == null || postBody == '')
                // IE doesn't accept null, undefined or '' post body
                postBody = '[empty request]';      
        }

        // send data
        xhr.send(postBody);

        ;;;if (this.debug) logOutput('Request over, waiting for response');

        return true;
      },

      repeat: function(){
        if (this.requestData)
        {
          this.abort();
          this.send(this.requestData);
        }
      },

      abort: function()
      {
        if (!this.isIdle())
        {
          TimeEventManager.remove(this, 'timeoutAbort');
          this.xhr.onreadystatechange = Function.$undef;
          this.xhr.abort();
          readyStateChangeHandler.call(this, STATE_UNSENT);
        }
      },

      timeoutAbort: function(){
        this.proxy.event_timeout();
        this.abort();
      },

      destroy: function(){
        this.abort();

        this.clearInfluence();

        delete this.xhr;
        delete this.requestData;
        delete this.prevReadyState_;

        DataObject.prototype.destroy.call(this);
      }
    });


    //
    // ProxyDispatcher
    //

    var ProxyDispatcher = new EventObject({
      abort: function(){
        var result = Array.from(inprogressProxies);
        for (var i = 0; i < result.length; i++)
          result[i].abort();

        return result;
      }
    });

    var inprogressProxies = [];
    ProxyDispatcher.addHandler({
      start: function(){
        inprogressProxies.add(this);
      },
      complete: function(){
        inprogressProxies.remove(this);
      }
    });

   /**
    * @function createEvent
    */

    function createEvent(eventName) {
      var event = Basis.EventObject.createEvent(eventName);
      return function(){
        event.apply(ProxyDispatcher, arguments);
        event.apply(this, arguments);
      }
    }


    /**
     * @class Proxy
     */

    var Proxy = Class(EventObject, {
      requests: null,

      poolHashGetter: Function.$true,

      event_start: createEvent('start'),
      event_timeout: createEvent('timeout'),
      event_abort: createEvent('abort'),
      event_success: createEvent('success'),
      event_failure: createEvent('failure'),
      event_complete: createEvent('complete'),

      init: function(config){
        this.requests = {};

        EventObject.prototype.init.call(this, config);

        // handlers
        if (this.callback)
          this.addHandler(this.callback, this);
      },

      getRequestByHash: function(requestHashId){
        if (!this.requests[requestHashId])
        {
          var request;
          //find idle transport
          for (var i in this.requests)
            if (this.requests[i].isIdle())
            {
              request = this.requests[i];
              delete this.requests[i];
            }

          this.requests[requestHashId] = request || new this.requestClass({ proxy: this });
        }

        return this.requests[requestHashId];
      },

      prepare: Function.$self,

      request: function(config){
        var requestData = Object.extend({}, config);

        if (!(requestData = this.prepare(requestData)))
          return;

        var requestHashId = this.poolHashGetter(requestData);

        var request = this.getRequestByHash(requestHashId);

        request.abort();
        request.setInfluence(requestData.influence);

        return request.doRequest(requestData);
      },

      abort: function(timeout){
        for (var i in this.requests)
          this.requests[i].abort();
      },

      destroy: function(){
        for (var i in this.requests)
          this.requests[i].destroy();
          
        EventObject.prototype.destroy.call(this);

        delete this.requests;
        Cleaner.remove(this);
      }
    });

    Proxy.createEvent = createEvent;


   /**
    * @class AjaxProxy
    */
    var AjaxProxy = Class(Proxy, {
      className: namespace + '.AjaxProxy',

      requestClass: AjaxRequest,

      event_readyStateChanged: createEvent('readyStateChanged'),
      event_httpStatus: createEvent('httpStatus'),

      debug: DEBUG_MODE,

      // transport properties
      asynchronous: true,
      method: DEFAULT_METHOD,
      contentType: DEFAULT_CONTENT_TYPE,
      encoding: null,

      init: function(config){
        Proxy.prototype.init.call(this, config);

        this.requestHeaders = {};
        this.params = {};

        Cleaner.add(this);  // ???
      },

      // params methods
      setParam: function(name, value){
        this.params[name] = value;
      },
      setParams: function(params){
        this.clearParams();
        for (var key in params)
          this.setParam(key, params[key]);
      },
      removeParam: function(name){
        delete this.params[name];
      },
      clearParams: function(){
        for (var key in this.params)
          delete this.params[key];
      },

      prepare: function(requestData){
        var url = requestData.url || this.url;

        if (!url)
          throw new Error('URL is not defined');

        Object.extend(requestData, {
          url: url,
          method: this.method.toUpperCase(),
          contentType: this.contentType,
          encoding: this.encoding,
          asynchronous: this.asynchronous,
          headers: [this.requestHeaders, requestData.headers].merge(),
          postBody: requestData.postBody || this.postBody,
          params: [this.params, requestData.params].merge(),
          influence: requestData.influence
        });

        return requestData;
      },

      get: function(){
        this.request.apply(this, arguments);
      }
    });

    var Service = Class(null, {
      proxyClass: AjaxProxy,
      requestClass: AjaxRequest,

      init: function(config){
        if (this.requestClass)
          this.proxyClass.prototype.requestClass = this.requestClass;
      },

      createProxy: function(config){
        var service = this;
        return Function.lazyInit(function(){
          return new service.proxyClass(config);
        });
      }
    });

    //
    // export names
    //

    Basis.namespace(namespace).extend({
      Transport: AjaxProxy,
      TransportDispatcher: ProxyDispatcher,
      createEvent: createEvent,

      Proxy: Proxy,
      AjaxProxy: AjaxProxy,
      AjaxRequest: AjaxRequest,
      ProxyDispatcher: ProxyDispatcher,
      Service: Service
    });

  })();
