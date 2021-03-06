// -------------------------------------------------------------------------
//                     The CodeChecker Infrastructure
//   This file is distributed under the University of Illinois Open Source
//   License. See LICENSE.TXT for details.
// -------------------------------------------------------------------------

define([
  'dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/Deferred',
  'dojo/dom-class',
  'dojo/dom-construct',
  'dojo/dom-style',
  'dojo/topic',
  'dijit/ConfirmDialog',
  'dijit/Dialog',
  'dijit/form/Button',
  'dijit/layout/ContentPane',
  'codechecker/hashHelper',
  'codechecker/filter/BugPathLengthFilter',
  'codechecker/filter/CheckerMessageFilter',
  'codechecker/filter/CheckerNameFilter',
  'codechecker/filter/DateFilter',
  'codechecker/filter/DetectionStatusFilter',
  'codechecker/filter/DiffTypeFilter',
  'codechecker/filter/FileFilter',
  'codechecker/filter/ReportCount',
  'codechecker/filter/ReportHashFilter',
  'codechecker/filter/ReviewStatusFilter',
  'codechecker/filter/RunBaseFilter',
  'codechecker/filter/RunHistoryTagFilter',
  'codechecker/filter/SelectFilter',
  'codechecker/filter/SeverityFilter',
  'codechecker/filter/SourceComponentFilter',
  'codechecker/filter/UniqueFilter',
  'codechecker/util'],
function (declare, lang, Deferred, domClass, dom, domStyle, topic,
  ConfirmDialog, Dialog, Button, ContentPane, hashHelper, BugPathLengthFilter,
  CheckerMessageFilter, CheckerNameFilter, DateFilter, DetectionStatusFilter,
  DiffTypeFilter, FileFilter, ReportCount, ReportHashFilter, ReviewStatusFilter,
  RunBaseFilter, RunHistoryTagFilter, SelectFilter, SeverityFilter,
  SourceComponentFilter, UniqueFilter, util) {

  var FilterToggle = declare(ContentPane, {
    class : 'filter-toggle',
    open : true,

    postCreate : function () {
      var that = this;

      var header = dom.create('div', {
        class : 'header',
        onclick : function () {
          that.open = !that.open;

          if (that.open) {
            domClass.remove(that._dropDownIcon, 'carret-up');
            domClass.add(that._dropDownIcon, 'carret-down');
            that.show();
          } else {
            domClass.remove(that._dropDownIcon, 'carret-down');
            domClass.add(that._dropDownIcon, 'carret-up');
            that.hide();
          }
        }
      });
      dom.place(header, this.domNode);

      this._dropDownIcon = dom.create("span", {
        class : "customIcon " + (this.open ? "carret-down" : "carret-up")
      }, header);
      dom.create("span", { innerHTML : this.title }, header);
    },

    hide : function () {
      this.getChildren().forEach(function (child) {
        domStyle.set(child.domNode, {
          position : 'fixed',
          top : 99999 + 'px',
          visibility : 'hidden'
        });
      });
    },

    show : function () {
      this.getChildren().forEach(function (child) {
        domStyle.set(child.domNode, {
          position : '',
          top : '',
          visibility : ''
        });
        child.resize();
      });
    }
  });

  return declare(ContentPane, {
    constructor : function () {
      this.runIds = [];
      this.reportFilter = new CC_OBJECTS.ReportFilter();
      this.cmpData = null;

      this._filters = []; // Registered filter components.
      this._isInitalized = false; // Shows that filter is already initalized.
    },

    postCreate : function () {
      var that = this;

      var queryParams = hashHelper.getState();

      //--- Clear all filter button ---//

      this._topBarPane = dom.create('div', { class : 'top-bar'}, this.domNode);
      this._clearAllButton = new Button({
        class   : 'clear-all-btn',
        label   : 'Clear All Filters',
        onClick : function () {
          that.clearAll();
          that.notifyAll();
        }
      });
      dom.place(this._clearAllButton.domNode, this._topBarPane);

      this._removeDialog = new ConfirmDialog({
        title     : 'Remove filtered results',
        handleFailure : function (message) {
          new Dialog({
            title : 'Failure!',
            content : message
          }).show();
        },
        onExecute : function () {
          var self = this;
          CC_SERVICE.removeRunReports(that.runIds, that.reportFilter,
            that.cmpData, function (res) {
              if (res) {
                that.notifyAll();
              } else {
                self.handleFailure('Failed to remove run results!');
              }
            }).fail(function (jsReq, status, exc) {
              self.handleFailure(exc.message);
              util.handleAjaxFailure(jsReq);
            });
        }
      });

      //--- Unique reports filter ---//

      this._uniqueFilter = new UniqueFilter({
        class : 'is-unique',
        parent : this,
        updateReportFilter : function (isUnique) {
          that.reportFilter.isUnique = isUnique;

          if (isUnique)
            that._detectionStatusFilter.notAvailable();
          else
            that._detectionStatusFilter.available();
        }
      });
      this.register(this._uniqueFilter);
      this.addChild(this._uniqueFilter);

      //--- Report count ---//

      this._reportCount = new ReportCount({
        parent : this,
        class : 'report-count'
      });
      this.register(this._reportCount);
      this.addChild(this._reportCount);

      //--- Report hash filter ---//

      this._reportHashFilter = new ReportHashFilter({
        class    : 'report-hash',
        title    : 'Report Hash',
        parent   : this,
        updateReportFilter : function (state) {
          that.reportFilter.reportHash = state ? [ state + '*' ] : null;
        }
      });
      this.register(this._reportHashFilter);
      this.addChild(this._reportHashFilter);

      //--- Baseline filter wrapper ---//

      var baselineFilterToggle = new FilterToggle({ title : 'Baseline' });
      this.addChild(baselineFilterToggle);

      //--- Run baseline filter ---//

      this._runBaseLineFilter = new RunBaseFilter({
        class : 'run',
        title : 'Run name',
        parent : this,
        updateReportFilter : function () {
          that.runIds = this.getRunIds();
        },
        initReportFilterOptions : function (opt) {
          var opt = that.initReportFilterOptions(opt);
          opt.cmpData = null;

          return opt;
        }
      });
      this.register(this._runBaseLineFilter);
      baselineFilterToggle.addChild(this._runBaseLineFilter);

      //--- Run history tags filter ---//

      this._runHistoryTagFilter = new RunHistoryTagFilter({
        class : 'run-tag',
        title : 'Run tag',
        parent   : this,
        updateReportFilter : function () {
          that.reportFilter.runTag = this.getTagIds();
        },
        initReportFilterOptions : function (opt) {
          var opt = that.initReportFilterOptions(opt);
          opt.cmpData = null;

          return opt;
        }
      });
      this.register(this._runHistoryTagFilter);
      baselineFilterToggle.addChild(this._runHistoryTagFilter);

      this._newCheckFilterToggle = new FilterToggle({
        title : 'Newcheck',
        open : this.isDiffView(queryParams)
      });
      this.addChild(this._newCheckFilterToggle);

      //--- Run newcheck filter ---//

      this._runNewCheckFilter = new RunBaseFilter({
        class : 'newcheck',
        title : 'Run name',
        parent : this,
        updateReportFilter : function () {
          var runIds = this.getRunIds();

          if (runIds) {
            if (!that.cmpData) {
              that.cmpData = new CC_OBJECTS.CompareData();
              that.cmpData.diffType = that._diffTypeFilter.defaultDiffType;
            }
            that.cmpData.runIds = runIds;
          } else if (that.cmpData && !that.cmpData.runTag) {
            that.cmpData = null;
          }
        },
        initReportFilterOptions : function (opt) {
          var opt = that.initReportFilterOptions(opt);

          if (opt.reportFilter)
            opt.reportFilter.runTag = null;

          return opt;
        }
      });
      this.register(this._runNewCheckFilter);
      this._newCheckFilterToggle.addChild(this._runNewCheckFilter);

      //--- Run history tags filter for newcheck ---//

      this._runHistoryTagNewCheckFilter = new RunHistoryTagFilter({
        class : 'run-tag-newcheck',
        title : 'Run tag',
        parent   : this,
        updateReportFilter : function () {
          var tagIds = this.getTagIds();

          if (tagIds) {
            if (!that.cmpData) {
              that.cmpData = new CC_OBJECTS.CompareData();
              that.cmpData.diffType = that._diffTypeFilter.currentDiffType;
            }
            that.cmpData.runTag = this.getTagIds();
          } else if (!that.runIds) {
            that.cmpData = null;
          }
        },
        initReportFilterOptions : function (opt) {
          var opt = that.initReportFilterOptions(opt);

          if (opt.reportFilter)
            opt.reportFilter.runTag = null;
          if (opt.runIds)
            opt.runIds = opt.cmpData ? opt.cmpData.runIds : null;
          opt.cmpData = null;

          return opt;
        }
      });
      this.register(this._runHistoryTagNewCheckFilter);
      this._newCheckFilterToggle.addChild(this._runHistoryTagNewCheckFilter);

      //--- Diff type filter ---//

      this._diffTypeFilter = new DiffTypeFilter({
        class : 'difftype',
        title : 'Diff type',
        noAvailableTooltipItemMsg :
          'At least one run should be selected at Newcheck!',
        parent : this,
        updateReportFilter : function (diffType) {
          if (that.cmpData)
            that.cmpData.diffType = diffType;
        }
      });
      this.register(this._diffTypeFilter);
      this._newCheckFilterToggle.addChild(this._diffTypeFilter);

      //--- Review status filter ---//

      this._reviewStatusFilter = new ReviewStatusFilter({
        class : 'review-status',
        title : 'Review status',
        parent   : this,
        updateReportFilter : function (reviewStatuses) {
          that.reportFilter.reviewStatus = reviewStatuses;
        }
      });
      this.register(this._reviewStatusFilter);
      this.addChild(this._reviewStatusFilter);

      //--- Detection status filter ---//

      this._detectionStatusFilter = new DetectionStatusFilter({
        class : 'detection-status',
        title : 'Detection status',
        parent   : this,
        updateReportFilter : function (detectionStatuses) {
          that.reportFilter.detectionStatus = detectionStatuses;
        }
      });
      this.register(this._detectionStatusFilter);
      this.addChild(this._detectionStatusFilter);

      //--- Severity filter ---//

      this._severityFilter = new SeverityFilter({
        class : 'severity',
        title : 'Severity',
        parent   : this,
        updateReportFilter : function (severities) {
          that.reportFilter.severity = severities;
        }
      });
      this.register(this._severityFilter);
      this.addChild(this._severityFilter);

      //--- Bug path length filter ---//

      this._bugPathLengthFilter = new BugPathLengthFilter({
        class : 'bug-path-length',
        title : 'Bug path length',
        parent   : this,
        updateReportFilter : function (state) {
          var bugPathLength = null;

          if (state.minBugPathLength || state.maxBugPathLength)  {
            bugPathLength = new CC_OBJECTS.BugPathLengthRange({
              min : state.minBugPathLength ? state.minBugPathLength : null,
              max : state.maxBugPathLength ? state.maxBugPathLength : null,
            });
          }

          that.reportFilter.bugPathLength = bugPathLength;
        },
      });
      this.register(this._bugPathLengthFilter);
      this.addChild(this._bugPathLengthFilter);

      //--- Detection date filter ---//

      this._detectionDateFilter = new DateFilter({
        class    : 'detection-date',
        title    : 'Detection date',
        parent   : this,
        updateReportFilter : function (state) {
          that.reportFilter.firstDetectionDate = state.detectionDate;
          that.reportFilter.fixDate = state.fixDate;
        }
      });
      this.register(this._detectionDateFilter);
      this.addChild(this._detectionDateFilter);

      //--- File filter ---//

      this._fileFilter = new FileFilter({
        class : 'filepath',
        title : 'File path',
        parent: this,
        updateReportFilter : function (files) {
          that.reportFilter.filepath = files;
        }
      });
      this.register(this._fileFilter);
      this.addChild(this._fileFilter);

      //--- Source component filter ---//

      this._sourceComponentFilter = new SourceComponentFilter({
        class : 'source-component',
        title : 'Source component',
        parent: this,
        updateReportFilter : function (components) {
          that.reportFilter.componentNames = components;
        }
      });
      this.register(this._sourceComponentFilter);
      this.addChild(this._sourceComponentFilter);

      //--- Checker name filter ---//

      this._checkerNameFilter = new CheckerNameFilter({
        class : 'checker-name',
        title : 'Checker name',
        parent: this,
        updateReportFilter : function (checkerNames) {
          that.reportFilter.checkerName = checkerNames;
        }
      });
      this.register(this._checkerNameFilter);
      this.addChild(this._checkerNameFilter);

      //--- Checker message filter ---//

      this._checkerMessageFilter = new CheckerMessageFilter({
        class : 'checker-msg',
        title : 'Checker message',
        parent   : this,
        updateReportFilter : function (checkerMessages) {
          that.reportFilter.checkerMsg = checkerMessages;
        }
      });
      this.register(this._checkerMessageFilter);
      this.addChild(this._checkerMessageFilter);

      var hasStore = false;
      try {
        hasStore = CC_AUTH_SERVICE.hasPermission(
          Permission.PRODUCT_STORE, util.createPermissionParams({
            productID : CURRENT_PRODUCT.id
          }));
      } catch (ex) { util.handleThriftException(ex); }

      //--- Footer bar ---//

      if (hasStore) {
        this._footerBarPane = dom.create('div', {
          class : 'footer-bar'
        }, this.domNode);

        this._removeAllButton = new Button({
          class : 'remove-all-btn',
          label : 'Remove Filtered Reports',
          onClick : function () {
            var count = that._reportCount.getReportCount();
            var content = 'Are you sure you want to remove all filtered '
                        + 'results?  <b class="error">' + count + '</b> '
                        + 'report(s) will be removed!';
            that._removeDialog.set('content', content);
            that._removeDialog.show();
          }
        });
        dom.place(this._removeAllButton.domNode, this._footerBarPane);
      }

      // Select initial base line and new check values which come from the
      // constructor.
      if (this.baseline) {
        this.baseline.forEach(function (runName) {
          that._runBaseLineFilter.select(runName);
        });
        queryParams[that._runBaseLineFilter.class] = this.baseline;
      }

      if (this.newcheck) {
        this.newcheck.forEach(function (runName) {
          that._runNewCheckFilter.select(runName);
        });
        queryParams[that._runNewCheckFilter.class] = this.newcheck;
      }

      // Initalize only the current tab.
      if (this.parent.tab === queryParams.tab || this.openedByUserEvent)
        this.initAll(queryParams);

      this._subscribeTopics();
    },

    // Subscribe on topics
    _subscribeTopics : function () {
      var that = this;

      // When "browser back" or "browser forward" button is pressed we update
      // the filter by the url state.
      that._hashChangeTopic = topic.subscribe('/dojo/hashchange',
      function (url) {
        if (!that.parent.selected || hashHelper.hashSetProgress)
          return;

        var state = hashHelper.getState();
        that.initAll(state);
      });
    },

    // Returns the list of registered filters.
    getFilters : function () { return this._filters; },

    // Returns report filter options of the current filter set.
    getReportFilter : function () { return this.reportFilter; },

    // Returns run ids of the current filter set.
    getRunIds : function () { return this.runIds; },

    // It will return null if filter view is normal otherwise in diff view
    // it returns filter compare data of the current filter set.
    getCmpData : function () { return this.cmpData; },

    // Register a new filter component.
    register : function (filter) { this._filters.push(filter); },

    // Returns true if the filter view is already initalized otherwise false.
    // Filter view is being initalized when it will be shown first.
    isInitalized : function () { return this._isInitalized; },

    // Returns copy of report filter options.
    initReportFilterOptions : function (opt) {
      if (!opt) opt = {};
      if (!opt.runIds) opt.runIds = lang.clone(this.runIds);
      if (!opt.reportFilter) opt.reportFilter = lang.clone(this.reportFilter);
      if (!opt.cmpData) opt.cmpData = lang.clone(this.cmpData);
      if (!opt.offset) opt.offset = 0;
      return opt;
    },

    isDiffView : function (queryParams) {
      return queryParams.newcheck || queryParams['run-tag-newcheck'];
    },

    // Return the URL state of the current filter set.
    getUrlState : function () {
      var state = {};
      this._filters.forEach(function (filter) {
        var urlState = filter.getUrlState();
        if (urlState)
          Object.keys(urlState).forEach(function(key) {
            state[key] = urlState[key];
          });
      });
      return state;
    },

    // Initalize all filter by URL parameters.
    initAll : function (queryParams) {
      if (!queryParams) queryParams = {};

      if (!this.isInitalized()) {
        if (!queryParams.newcheck && this._newCheckFilterToggle)
          this._newCheckFilterToggle.hide();

        // Set default values if the tab has not been initalized before and if
        // it is initalized by user clicks not by the URL.
        if (this.openedByUserEvent)
          this._filters.forEach(function (filter) {
            if (filter.defaultValues) {
              var defaultValues = filter.defaultValues();
              for (var key in defaultValues)
                if (!queryParams[key])
                  queryParams[key] = defaultValues[key];
            }
          });
      }

      // Init filters by the parameter values.
      this._filters.forEach(function (filter) {
        filter.initByUrl(queryParams);
      });

      //--- Notify all filters on changed ---//

      this.notifyAll();
      this._isInitalized = true;
    },

    // Notify all filter except those which are in the except array parameter.
    notifyAll : function (except) {
      this._filters.forEach(function (filter) {
        if (!except || except.indexOf(filter) === -1)
          filter.notify();
      });

      //--- Update URL state ---//

      var state = this.getUrlState();
      hashHelper.setStateValues(state);
    },

    // Clears all filter.
    clearAll : function () {
      this._filters.forEach(function (filter) {
        filter.clear();
      });
    },

    // Destroy DOM elements and subscriptions.
    destroy : function () {
      this.inherited(arguments);
      this._hashChangeTopic.remove();
    }
  });
});
