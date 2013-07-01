/*
 * RESTAdapter
 * Builds REST urls to resources
 * Builds and handles remote ajax requests
 */
RESTless.RESTAdapter = RESTless.Adapter.extend({
  /*
   * serializer: default to a JSON serializer
   */
  serializer: RESTless.JSONSerializer.create(),

  /*
   * url: base url of backend REST service
   * example: 'https://api.example.com'
   */
  url: null,
  /*
   * namespace: endpoint path
   * example: 'api/v1'
   */
  namespace: null,
  /*
   * useContentTypeExtension: forces content type extensions on resource requests
   * i.e. /posts.json vs /posts | /posts/115.json vs /posts/115
   * Useful for conforming to 3rd party apis
   * or returning correct content-type headers with Rails caching
   */
  useContentTypeExtension: false,

  /*
   * rootPath: computed path based on url and namespace
   */
  rootPath: Ember.computed(function() {
    var a = document.createElement('a'),
        url = this.get('url'),
        ns = this.get('namespace'),
        rootReset = ns && ns.charAt(0) === '/';

    a.href = url ? url : '';
    if(ns) {
      a.pathname = rootReset ? ns : (a.pathname + ns);
    }
    return a.href.replace(/\/+$/, '');
  }).property('url', 'namespace'),

  /*
   * resourcePath: helper method creates a valid REST path to a resource
   * App.Post => 'posts',  App.PostGroup => 'post_groups'
   */
  resourcePath: function(resourceName) {
    return this.pluralize(Ember.String.decamelize(resourceName));
  },

  /*
   * request: configures and returns an ajax request
   */
  request: function(model, params, resourceKey) {
    params.url = this.buildUrl(model, resourceKey);
    params.dataType = this.get('serializer.dataType');
    params.contentType = this.get('serializer.contentType');

    if(params.data && params.type !== 'GET') {
      params.data = this.get('serializer').prepareData(params.data);
    }

    var request = $.ajax(params);
    model.set('currentRequest', request);
    return request;
  },

  /*
   * buildUrl (private): constructs request url and dynamically adds the a resource key if specified
   */
  buildUrl: function(model, resourceKey) {
    var resourcePath = this.resourcePath(get(model.constructor, 'resourceName')),
        primaryKey = get(model.constructor, 'primaryKey'),
        urlParts = [this.get('rootPath'), resourcePath],
        dataType = this.get('serializer.dataType'), url;

    if(resourceKey) {
      urlParts.push(resourceKey);
    } else if(model.get(primaryKey)) {
      urlParts.push(model.get(primaryKey));
    }

    url = urlParts.join('/');
    if(this.get('useContentTypeExtension') && dataType) {
      url += '.' + dataType;
    }
    return url;
  },

  /*
   * saveRecord: POSTs a new record, or PUTs an updated record to REST service
   */
  saveRecord: function(record) {
    //If an existing model isn't dirty, no need to save.
    if(!record.get('isNew') && !record.get('isDirty')) {
      return $.Deferred().resolve();
    }
    record.set('isSaving', true);

    var isNew = record.get('isNew'), // purposely cache value for triggering correct event later
        method = isNew ? 'POST' : 'PUT',
        saveRequest = this.request(record, { type: method, data: record.serialize() }),
        self = this;

    saveRequest.done(function(data){
      if (data) {    // 204 No Content responses send no body
        record.deserialize(data);
      }
      record.clearErrors();
      record.set('isDirty', false);
      record._triggerEvent(isNew ? 'didCreate' : 'didUpdate');
    })
    .fail(function(jqxhr) {
      self._onError(record, jqxhr.responseText);
    })
    .always(function() {
      record.set('isSaving', false);
      record.set('isLoaded', true);
      record._triggerEvent('didLoad');
    });
    return saveRequest;
  },

  deleteRecord: function(record) {
    var deleteRequest = this.request(record, { type: 'DELETE', data: record.serialize() }),
        self = this;

    deleteRequest.done(function(){
      record._triggerEvent('didDelete');
      record.destroy();
    })
    .fail(function(jqxhr) {
      self._onError(record, jqxhr.responseText);
    });
    return deleteRequest;
  },

  findAll: function(model) {
    return this.findQuery(model, null);
  },

  findQuery: function(model, queryParams) {
    var resourceInstance = model.create({ isNew: false }),
        result = RESTless.RecordArray.createWithContent({ type: model.toString() }),
        findRequest = this.request(resourceInstance, { type: 'GET', data: queryParams }),
        self = this;

    findRequest.done(function(data){
      result.deserializeMany(data);
      result.clearErrors();
    })
    .fail(function(jqxhr) {
      self._onError(result, jqxhr.responseText);
    })
    .always(function() {
      result.set('isLoaded', true);
      result._triggerEvent('didLoad');
    });
    return result;
  },

  findByKey: function(model, key, queryParams) {
    var result = model.create({ isNew: false }),
        findRequest = this.request(result, { type: 'GET', data: queryParams }, key),
        self = this;

    findRequest.done(function(data){
      result.deserialize(data);
      result.clearErrors();
    })
    .fail(function(jqxhr) {
      self._onError(result, jqxhr.responseText);
    })
    .always(function() {
      result.set('isLoaded', true);
      result._triggerEvent('didLoad');
    });
    return result;
  },

  /*
   * registerTransform: fowards custom tranform creation to serializer
   */
  registerTransform: function(type, transform) {
    this.get('serializer').registerTransform(type, transform);
  },

  /* 
   * _onError: (private) helper method for handling error responses
   * Parses error json, sets error properties, and triggers error events
   */
  _onError: function(model, errorResponse) {
    var errorData = null;
    try { errorData = $.parseJSON(errorResponse); } catch(e){}
    model.setProperties({ 'isError': true, 'errors': errorData });
    model._triggerEvent('becameError');
  }
});
