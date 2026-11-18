/**
 * Reports Admin JavaScript
 *
 * Handles date picking, chart rendering, table pagination/sorting,
 * data exports, and auto-refresh functionality for the reports admin.
 *
 * @package SugarCommerce\Reports
 */

(function ($) {
    'use strict';

    /**
     * This copy's configuration.
     *
     * Each Strauss-prefixed copy of the library enqueues its own reports.js
     * under its own handle, so a shared global would leave two plugins on one
     * screen reading the same REST namespace and nonce. Resolve our own entry
     * from the handle WordPress stamped on the script element executing now.
     */
    const cfg = (function () {
        const el = document.currentScript;
        const handle = el && el.id ? el.id.replace(/-js$/, '') : '';
        const registry = window.SugarCommerceReports || {};

        return registry[handle] || window.SugarcommerceReportsAdmin || {};
    })();

    /**
     * A REST request, given as $.ajax would take it.
     *
     * Through wp.apiFetch when the page has it, because the nonce printed
     * with the page runs out after a day: a report left open (and refreshing
     * itself) overnight then got a 403 on every refresh, export and screen
     * option. apiFetch notices the stale nonce, asks for a fresh one and
     * sends the request again. The callbacks are $.ajax's -- `success` gets
     * the decoded body, `error` something with the `responseJSON` and
     * `status` an xhr would have, `complete` runs after either -- so the
     * callers read the answer the same either way.
     *
     * @param {Object} options url, method, data, contentType, success, error, complete.
     * @returns {void}
     */
    function rest(options) {
        const api = window.wp && window.wp.apiFetch;
        const method = options.method || 'GET';

        if (typeof api !== 'function') {
            $.ajax($.extend({}, options, {
                beforeSend: (xhr) => {
                    xhr.setRequestHeader('X-WP-Nonce', cfg.restNonce);
                }
            }));

            return;
        }

        const request = {
            url: options.url,
            method: method,
            headers: { 'X-WP-Nonce': cfg.restNonce },
            parse: true
        };

        if (method === 'GET') {
            const query = options.data ? $.param(options.data) : '';

            if (query) {
                request.url += (request.url.indexOf('?') === -1 ? '?' : '&') + query;
            }
        } else if (options.data !== undefined) {
            request.body = options.data;

            if (options.contentType) {
                request.headers['Content-Type'] = options.contentType;
            }
        }

        api(request).then((response) => {
            if (options.success) {
                options.success(response);
            }
        }, (error) => {
            const body = error && typeof error === 'object' && ['invalid_json', 'fetch_error', 'offline_error'].indexOf(error.code) === -1 && error.name !== 'AbortError' ? error : undefined;

            if (options.error) {
                options.error({ responseJSON: body, status: (body && body.data && body.data.status) || 0 });
            }
        }).finally(() => {
            if (options.complete) {
                options.complete();
            }
        });
    }

    /**
     * Main Reports Controller
     *
     * @namespace ReportsController
     */
    const ReportsController = {

        /* ========================================================================
         * PROPERTIES
         * ======================================================================== */

        /**
         * Chart.js instances indexed by chart ID
         *
         * @type {Object.<string, Chart>}
         */
        charts: {},

        /**
         * Original chart configurations for refresh (preserves styling)
         *
         * @type {Object.<string, Object>}
         */
        chartConfigs: {},

        /**
         * Table column configurations for refresh
         *
         * @type {Object.<string, Object>}
         */
        tableConfigs: {},

        /**
         * Auto-refresh interval timer
         *
         * @type {number|null}
         */
        refreshTimer: null,

        /**
         * Timestamp of last data refresh
         *
         * @type {Date|null}
         */
        lastUpdated: null,

        /**
         * Timer for updating "last updated" text
         *
         * @type {number|null}
         */
        lastUpdatedTimer: null,

        /* ========================================================================
         * INITIALIZATION
         * ======================================================================== */

        /**
         * Initialize the reports controller
         *
         * @returns {void}
         */
        init: function () {
            this.repositionNotices();
            this.revealCurrentSection();
            this.bindEvents();
            this.initCharts();
            this.initSparklines();
            this.initTables();
            this.initRefresh();
        },

        /* ========================================================================
         * TWEAKS
         * ======================================================================== */

        /**
         * Move any stray notices into our notices container
         *
         * @returns {void}
         */
        repositionNotices: function () {
            const $wrap = $('.reports-wrap');
            const $noticesContainer = $wrap.find('.reports-notices');

            if (!$noticesContainer.length) return;

            // Move any notices that appear before or after the header into our container
            $wrap.find('.notice, .updated, .error').not('.reports-notices .notice, .reports-notices .updated, .reports-notices .error').each(function () {
                $(this).appendTo($noticesContainer);
            });

            // Also catch notices WordPress injects at wrap level
            $wrap.siblings('.notice, .updated, .error').each(function () {
                $(this).appendTo($noticesContainer);
            });

            // With the sections down the side the wrap is a column of the
            // shell, and what WordPress injects lands beside the shell.
            $('.reports-shell').siblings('.notice, .updated, .error').each(function () {
                $(this).appendTo($noticesContainer);
            });
        },

        /**
         * Bring the current section into view in a row that scrolls
         *
         * The tab bar, and the sidebar on a narrow screen, are one line that
         * scrolls sideways when the sections do not fit. Arriving on the
         * ninth of ten, the row would otherwise open on the first three and
         * the one being read would be somewhere off the edge.
         *
         * Only the row is moved, never the page. Where everything fits
         * there is nothing to scroll and this does nothing.
         *
         * @returns {void}
         */
        revealCurrentSection: function () {
            $('.reports-sidebar-link[aria-current], .reports .field-kit__page-tab[aria-current]').each(function () {
                const row = this.closest('.reports-sidebar-scroll, .field-kit__page-tabs');

                if (!row || row.scrollWidth <= row.clientWidth) return;

                const link = this.getBoundingClientRect();
                const box = row.getBoundingClientRect();

                row.scrollLeft += (link.left - box.left) - (box.width - link.width) / 2;
            });
        },

        /**
         * Bind all event handlers
         *
         * @returns {void}
         */
        bindEvents: function () {
            // Date picker
            $(document).on('click', '.reports-date-picker-toggle', this.onDatePickerToggle.bind(this));
            $(document).on('click', '.reports-date-preset', this.onPresetClick.bind(this));
            $(document).on('click', '.reports-date-picker-apply', this.onApplyCustomDate.bind(this));
            $(document).on('click', '.reports-date-picker-cancel', this.onCancelCustomDate.bind(this));
            $(document).on('click', this.onDocumentClick.bind(this));

            // Filters apply themselves. Choosing a country and then having to
            // press a button to mean it is one step more than the choice
            // needed; a field somebody types into still waits for Enter, so
            // it keeps its button.
            $('.reports-filter-form').each(function () {
                const $form = $(this);
                // A combobox has a text input too, but it is the face of a
                // select: what it changes is the select, which is heard.
                const typed = $form
                    .find('input[type="text"], input[type="search"], input[type="number"]')
                    .not('.field-kit__combobox input')
                    .filter(':visible').length > 0;

                if (!typed) {
                    $form.addClass('reports-filter-form--auto');
                }
            });

            $(document).on('change', '.reports-filter-form select, .reports-filter-form input[type="checkbox"], .reports-filter-form input[type="radio"], .reports-filter-form input[type="date"]', function () {
                const form = $(this).closest('form').get(0);

                if (!form) {
                    return;
                }

                $(form).addClass('reports-filter-form--busy');

                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                } else {
                    form.submit();
                }
            });

            // Tables
            $(document).on('click', '.reports-table th.sortable', this.onTableSort.bind(this));
            $(document).on('click', '.reports-table-pages button', this.onTablePage.bind(this));

            // Exports
            $(document).on('click', '.reports-export-button', this.onExportClick.bind(this));

            // Refresh
            $(document).on('click', '.reports-refresh-button', this.onRefreshClick.bind(this));

            // Screen Options
            $(document).on('change', '.reports-screen-options input[type="checkbox"]', this.onScreenOptionChange.bind(this));
        },

        /**
         * A Screen Options box was ticked or unticked.
         *
         * The component goes the moment the box does, the way core's column
         * toggles work -- there is no Apply button to find -- and the choice
         * is saved for this user over REST. Showing one again takes a
         * reload: a hidden component is left out of the markup on load so
         * the refresh payload and the screen agree, so there is nothing on
         * the page to reveal until it is drawn again.
         *
         * @param {Event} e - Change event
         * @returns {void}
         */
        onScreenOptionChange: function (e) {
            const $box = $(e.currentTarget);
            const $panel = $box.closest('.reports-screen-options');
            const $component = $('.reports-wrap [data-component-id="' + $box.val() + '"]');
            const shown = $panel.find('input[type="checkbox"]:checked').map((i, el) => el.value).get();

            if ($component.length) {
                $component.toggle($box.prop('checked'));
            }

            rest({
                url: cfg.restUrl + 'screen-options',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    report_id: $panel.data('report'),
                    tab: $panel.data('tab'),
                    shown: shown
                }),
                success: () => {
                    if ($box.prop('checked') && !$component.length) {
                        window.location.reload();
                    }
                },
                error: () => {
                    // Put the box and the component back, so the screen
                    // never shows a choice that was not kept.
                    $box.prop('checked', !$box.prop('checked'));

                    if ($component.length) {
                        $component.toggle($box.prop('checked'));
                    }
                }
            });
        },

        /* ========================================================================
         * HELPERS
         * ======================================================================== */

        /**
         * Get localized string with optional sprintf-style replacements
         *
         * @param {string}    key  - i18n key from cfg.i18n
         * @param {...*}      args - Replacement values for %s, %d, %1$s, %2$d, etc.
         * @returns {string}
         */
        i18n: function (key, ...args) {
            // The config resolution ends in `|| {}` for the case where no
            // registry entry matches the handle — and that empty object has
            // no i18n, so every call here was a TypeError in exactly the
            // situation the fallback exists to survive. The key itself is a
            // reasonable last resort: an untranslated word beats a dead page.
            let str = (cfg.i18n || {})[key] || key;

            if (args.length === 0) {
                return str;
            }

            // Handle positional placeholders like %1$d, %2$s
            str = str.replace(/%(\d+)\$([sd])/g, (match, position, type) => {
                const index = parseInt(position, 10) - 1;
                return args[index] !== undefined ? args[index] : match;
            });

            // Handle simple placeholders like %d, %s
            let argIndex = 0;
            str = str.replace(/%([sd])/g, (match, type) => {
                return args[argIndex] !== undefined ? args[argIndex++] : match;
            });

            return str;
        },

        /* ========================================================================
         * AUTO-REFRESH
         * ======================================================================== */

        /**
         * Initialize auto-refresh functionality
         *
         * @returns {void}
         */
        initRefresh: function () {
            const $controls = $('.reports-refresh-controls');

            if (!$controls.length) {
                return;
            }

            const autoRefresh = parseInt($controls.data('auto-refresh'), 10);

            this.lastUpdated = new Date();

            if (autoRefresh > 0) {
                this.startAutoRefresh(autoRefresh);
                this.startLastUpdatedTimer();

                $(document).on('visibilitychange', this.onVisibilityChange.bind(this));
            }
        },

        /**
         * Start the auto-refresh interval
         *
         * @param {number} interval - Refresh interval in seconds
         * @returns {void}
         */
        startAutoRefresh: function (interval) {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
            }

            this.refreshTimer = setInterval(() => {
                this.refreshAllComponents();
            }, interval * 1000);
        },

        /**
         * Start the timer that updates "last updated" text
         *
         * @returns {void}
         */
        startLastUpdatedTimer: function () {
            if (this.lastUpdatedTimer) {
                clearInterval(this.lastUpdatedTimer);
            }

            this.lastUpdatedTimer = setInterval(() => {
                this.updateLastUpdatedText();
            }, 10000);
        },

        /**
         * Update the "last updated" display text
         *
         * @returns {void}
         */
        updateLastUpdatedText: function () {
            if (!this.lastUpdated) {
                return;
            }

            const seconds = Math.floor((new Date() - this.lastUpdated) / 1000);
            let text = '';

            if (seconds < 10) {
                text = this.i18n('updatedJustNow');
            } else if (seconds < 60) {
                text = this.i18n('updatedSeconds', seconds);
            } else if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                text = this.i18n('updatedMinutes', minutes);
            } else {
                const hours = Math.floor(seconds / 3600);
                text = this.i18n('updatedHours', hours);
            }

            $('.reports-last-updated-text').text(text);
        },

        /**
         * Handle page visibility changes (pause/resume auto-refresh)
         *
         * @returns {void}
         */
        onVisibilityChange: function () {
            const $controls = $('.reports-refresh-controls');
            const autoRefresh = parseInt($controls.data('auto-refresh'), 10);

            if (document.hidden) {
                if (this.refreshTimer) {
                    clearInterval(this.refreshTimer);
                    this.refreshTimer = null;
                }
            } else {
                if (autoRefresh > 0) {
                    this.startAutoRefresh(autoRefresh);
                }
            }
        },

        /**
         * Handle refresh button click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onRefreshClick: function (e) {
            e.preventDefault();
            this.refreshAllComponents();
        },

        /**
         * Refresh all components on the current tab
         *
         * @returns {void}
         */
        refreshAllComponents: function () {
            const $button = $('.reports-refresh-button');
            const $wrap = $('.reports-wrap');
            const reportId = $wrap.data('report-id');

            if (!reportId || $button.hasClass('refreshing')) {
                return;
            }

            $button.addClass('refreshing updating-message');
            $('.reports-content').addClass('reports-component-refreshing');

            const filters = this.getCurrentFilters();

            const requestData = {
                report_id: reportId,
                tab: this.getCurrentTab(),
                date_preset: this.getCurrentDatePreset(),
                date_start: this.getCurrentDateStart(),
                date_end: this.getCurrentDateEnd(),
                ...filters
            };

            rest({
                url: cfg.restUrl + 'components',
                method: 'GET',
                data: requestData,
                success: (response) => {
                    if (response.success && response.components) {
                        this.updateComponents(response.components);
                    }
                },
                error: (xhr) => {
                    console.error('Refresh failed:', xhr.responseJSON);
                },
                complete: () => {
                    $button.removeClass('refreshing updating-message');
                    $('.reports-content').removeClass('reports-component-refreshing');

                    this.lastUpdated = new Date();
                    this.updateLastUpdatedText();
                }
            });
        },

        /**
         * Update multiple components with new data
         *
         * @param {Object} components - Component data keyed by component ID
         * @returns {void}
         */
        updateComponents: function (components) {
            $.each(components, (componentId, data) => {
                const $component = $('[data-component-id="' + componentId + '"]');

                if (!$component.length) {
                    return;
                }

                if (data.type === 'tile' || $component.hasClass('reports-tile')) {
                    this.updateTile($component, data);
                } else if (data.type === 'chart' || $component.hasClass('reports-chart-wrapper')) {
                    this.updateChart(componentId, data);
                } else if (data.type === 'table' || $component.hasClass('reports-table-wrapper')) {
                    this.updateTable($component, componentId, data);
                } else if (data.type === 'progress') {
                    this.updateProgress($component, data);
                } else if (data.type === 'breakdown') {
                    this.updateBreakdown($component, data);
                } else if (data.type === 'stat_list') {
                    this.updateStatList($component, data);
                }
            });
        },

        /**
         * Update a progress component
         *
         * The server sends the percentage and both formatted figures — it did
         * the division and the formatting with the same code that rendered the
         * page, so there is nothing to work out here.
         *
         * @param {jQuery} $component - Progress wrapper
         * @param {Object} data       - Progress data
         * @returns {void}
         */
        updateProgress: function ($component, data) {
            const percent = Math.max(0, Math.min(100, parseFloat(data.percent) || 0));

            $component.find('.reports-progress-fill').css('width', percent + '%');
            $component.find('.reports-progress-track').attr('aria-valuenow', Math.round(percent));
            $component.find('.reports-progress-percent').text(data.formatted_percent || '');
            $component.find('.reports-progress-figures').text(data.formatted_figures || '');
        },

        /**
         * Update a breakdown component
         *
         * @param {jQuery} $component - Breakdown wrapper
         * @param {Object} data       - Breakdown data
         * @returns {void}
         */
        updateBreakdown: function ($component, data) {
            const $list = $component.find('.reports-breakdown');
            const rows = Array.isArray(data.rows) ? data.rows : [];

            $list.empty();
            $component.find('.reports-breakdown-empty').prop('hidden', rows.length > 0);

            rows.forEach((row) => {
                const $row = $('<li>').addClass('reports-breakdown-row');

                const $label = $('<span>').addClass('reports-breakdown-label').appendTo($row);

                // Appended, not .text(): the icon is already in the label
                // and .text() would replace it.
                $label.append(this.rowIcon(row));

                if (row.url) {
                    $('<a>').attr('href', row.url).text(row.label || '').appendTo($label);
                } else {
                    $label.append(document.createTextNode(row.label || ''));
                }

                $('<span>').addClass('reports-breakdown-track').append(
                    $('<span>').addClass('reports-breakdown-fill').css('width', (row.width || 0) + '%')
                ).appendTo($row);

                $('<span>').addClass('reports-breakdown-share').text(row.share || '').appendTo($row);
                $('<span>').addClass('reports-breakdown-value').text(row.formatted_value || '').appendTo($row);

                $list.append($row);
            });
        },

        /**
         * Update a stat list component
         *
         * @param {jQuery} $component - Stat list wrapper
         * @param {Object} data       - Stat list data
         * @returns {void}
         */
        updateStatList: function ($component, data) {
            const $list = $component.find('.reports-stat-list');
            const rows = Array.isArray(data.rows) ? data.rows : [];

            $list.empty();

            rows.forEach((row) => {
                $list.append(
                    $('<div>').addClass('reports-stat-row')
                        .append($('<dt>').text(row.label || ''))
                        .append($('<dd>').append(this.rowIcon(row), document.createTextNode(row.formatted_value || '')))
                );
            });
        },

        /**
         * The small picture a row can carry
         *
         * A flag, a thumbnail, a logo: the row gives its URL as `icon` and
         * the element is built here, the same one the page was drawn with
         * (ProgressRenderer::row_icon()), so a refresh does not take the
         * pictures away. Decoration, with the words beside it, so the
         * alternative text is empty.
         *
         * A row that names an icon (`heroicons-outline:globe-alt`) arrives
         * with it already drawn, as `icon_html` -- inline SVG the server
         * built and escaped -- and that is inserted as it is.
         *
         * @param {Object} row - A breakdown or stat list row
         * @returns {jQuery|null} The image, or null for a row without one
         */
        rowIcon: function (row) {
            if (row.icon_html) {
                return $(row.icon_html);
            }

            if (!row.icon) {
                return null;
            }

            return $('<img>').addClass('reports-row-icon').attr({
                src: row.icon,
                width: 16,
                height: 16,
                alt: '',
                loading: 'lazy',
                decoding: 'async'
            });
        },

        /**
         * Update a tile component with new data
         *
         * @param {jQuery} $tile - Tile element
         * @param {Object} data  - Tile data
         * @returns {void}
         */
        updateTile: function ($tile, data) {
            if (data.value !== undefined) {
                $tile.find('.reports-tile-value').text(data.formatted_value || data.value);
            }

            if (data.change !== undefined) {
                const $change = $tile.find('.reports-tile-change');

                // The rule the page was drawn by (TileRenderer): a change
                // and a direction to show it in, or an empty chip. The
                // server sends `change: null` for a tile with nothing to
                // compare against -- no earlier figure, or an earlier one
                // of nought -- and that read as 0, so a refresh gave
                // those tiles a "0.0%" they were not drawn with.
                if (data.change === null || !data.change_direction) {
                    $change
                        .removeClass('change-up change-down change-neutral')
                        .addClass('change-neutral')
                        .empty();

                    return;
                }

                const direction = ['up', 'down'].includes(data.change_direction) ? data.change_direction : 'neutral';

                // The arrow is the one the page was drawn with, rendered by
                // PHP into the config (Format::change_icon()).
                $change
                    .removeClass('change-up change-down change-neutral')
                    .addClass('change-' + direction)
                    .html((cfg.changeIcons || {})[direction] || '')
                    .append(document.createTextNode(' ' + Math.abs(data.change).toFixed(1) + '%'));
            }
        },

        /**
         * Update a chart component with new data
         *
         * Keeps what the page was drawn with for anything the new data
         * does not say, and styles the result as the page was styled.
         *
         * @param {string} chartId - Chart identifier
         * @param {Object} data    - Chart data with labels and datasets
         * @returns {void}
         */
        updateChart: function (chartId, data) {
            const chart = this.charts[chartId];
            const originalConfig = this.chartConfigs[chartId];

            if (!chart || !data.labels || !data.datasets) {
                return;
            }

            // Update labels
            chart.data.labels = data.labels;

            const chartType = originalConfig?.type || chart.config.type;

            chart.data.datasets = data.datasets.map((newDataset, index) => {
                // What the page was drawn with, for whatever the refreshed
                // dataset does not say -- and what it does say wins. A
                // colour given per bar follows the data: the tallest bar
                // this time is not the tallest one last time.
                const originalDataset = {...(originalConfig?.data?.datasets?.[index] || {})};

                delete originalDataset.data;
                delete originalDataset.label;

                // The stored copy of the config is JSON, which cannot hold
                // a gradient function -- so the fades are made again by
                // styleDataset(), or a refresh would swap them for nothing.
                return this.styleDataset({...originalDataset, ...newDataset}, chartType, index);
            });

            // Use 'none' animation mode for smoother refresh
            chart.update('none');

            this.markEmptyChart(chart.canvas, chart.config.type, chart.data);
        },

        /**
         * Update a table component with new data
         *
         * Rebuilds table rows based on stored column configuration.
         *
         * @param {jQuery} $wrapper    - Table wrapper element
         * @param {string} componentId - Component identifier
         * @param {Object} data        - Table data with rows
         * @returns {void}
         */
        updateTable: function ($wrapper, componentId, data) {
            if (!data.rows || !Array.isArray(data.rows)) {
                return;
            }

            const $table = $wrapper.find('.reports-table');
            const $tbody = $table.find('tbody');
            const config = this.tableConfigs[componentId] || {};
            const columns = config.columns || [];
            const rowActions = config.rowActions || [];

            // Clear existing rows
            $tbody.empty();

            // Handle empty state
            if (data.rows.length === 0) {
                const colSpan = columns.length + (rowActions.length > 0 ? 1 : 0);
                const emptyMessage = config.emptyMessage || this.i18n('noData');
                $tbody.append(
                    '<tr class="reports-table-empty-row"><td colspan="' + colSpan + '">' +
                    this.escapeHtml(emptyMessage) +
                    '</td></tr>'
                );
                return;
            }

            // Build rows.
            //
            // The cells arrive formatted and sanitized: the server runs them
            // through the same formatter that rendered the page and the same
            // wp_kses_post() that wrote it. Formatting them again here is how
            // the refresh came to print dollars on a site set to euros, and
            // writing them with .html() when nothing had sanitized them is
            // how a script tag that was inert on load ran on the first
            // refresh.
            data.rows.forEach((row, rowIndex) => {
                const $tr = $('<tr>');

                // The unformatted values, for the {placeholder} substitutions
                // in a row action's URL — an id formatted for display is
                // 1,204 and links to nothing.
                const raw = (data.raw && data.raw[rowIndex]) || row;

                // If we have column config, use it for ordering
                if (columns.length > 0) {
                    columns.forEach((col) => {
                        const columnKey = col.key || col;

                        const $td = $('<td>')
                            .attr('data-column', columnKey)
                            .html(row[columnKey] !== undefined ? row[columnKey] : '');
                        $tr.append($td);
                    });
                } else {
                    // No column config - output all row values in order
                    Object.keys(row).forEach((key) => {
                        const $td = $('<td>')
                            .attr('data-column', key)
                            .html(row[key] !== undefined ? row[key] : '');
                        $tr.append($td);
                    });
                }

                // Add row actions if configured
                if (rowActions.length > 0) {
                    const $actionsTd = $('<td>').addClass('reports-table-actions');
                    const $actionsWrap = $('<div>').addClass('reports-row-actions-wrap');

                    rowActions.forEach((action, actionIndex) => {
                        if (actionIndex > 0) {
                            $actionsWrap.append(' <span class="sep">|</span> ');
                        }

                        let url = action.url || '#';
                        // Replace placeholders in URL
                        Object.keys(raw).forEach((key) => {
                            if (typeof raw[key] === 'string' || typeof raw[key] === 'number') {
                                url = url.replace('{' + key + '}', encodeURIComponent(raw[key]));
                            }
                        });

                        const $link = $('<a>')
                            .attr('href', url)
                            .addClass('reports-row-action reports-row-action-' + action.key)
                            .text(action.label || action.key);

                        if (action.class) {
                            $link.addClass(action.class);
                        }
                        if (action.confirm) {
                            $link.attr('onclick', 'return confirm(\'' + this.escapeJs(action.confirm) + '\')');
                        }
                        if (action.target) {
                            $link.attr('target', action.target);
                        }

                        $actionsWrap.append($link);
                    });

                    $actionsTd.append($actionsWrap);
                    $tr.append($actionsTd);
                }

                $tbody.append($tr);
            });

            // Re-apply pagination if enabled
            const $container = $wrapper.find('.reports-table-container');
            if ($container.data('paginated')) {
                $container.data('current-page', 1);
                this.applyTablePagination($container);
            }
        },

        /**
         * Escape HTML entities
         *
         * @param {string} str - String to escape
         * @returns {string}
         */
        escapeHtml: function (str) {
            if (typeof str !== 'string') return str;
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        /**
         * Escape string for use in JavaScript
         *
         * @param {string} str - String to escape
         * @returns {string}
         */
        escapeJs: function (str) {
            if (typeof str !== 'string') return str;

            // Backslash first, or the escapes added below get escaped again.
            // PHP's esc_js() runs addslashes(), which covers all three; this
            // covered two, so a value ending in a backslash closed the string
            // it was supposed to be inside and everything after it was code.
            return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
        },

        /* ========================================================================
         * URL PARAMETER HELPERS
         * ======================================================================== */

        /**
         * Get current tab from URL
         *
         * @returns {string}
         */
        getCurrentTab: function () {
            const url = new URL(window.location.href);

            return url.searchParams.get('tab') || '';
        },

        /**
         * Get current date preset from URL
         *
         * @returns {string}
         */
        getCurrentDatePreset: function () {
            const url = new URL(window.location.href);

            return url.searchParams.get('date_preset') || cfg.defaultPreset || 'this_month';
        },

        /**
         * Get current date start from URL
         *
         * @returns {string}
         */
        getCurrentDateStart: function () {
            const url = new URL(window.location.href);

            return url.searchParams.get('date_start') || '';
        },

        /**
         * Get current date end from URL
         *
         * @returns {string}
         */
        getCurrentDateEnd: function () {
            const url = new URL(window.location.href);

            return url.searchParams.get('date_end') || '';
        },

        /**
         * Get all filter parameters from URL
         *
         * A multiselect submits its values as repeated `filter_status[]`
         * keys. Read one key at a time, each repeat overwrote the last and
         * the refresh carried a single value where the page had several --
         * so the numbers changed on refresh for no visible reason. The
         * bracketed keys are gathered into an array under the bare name,
         * which jQuery serialises back into the same repeated keys.
         *
         * @returns {Object}
         */
        getCurrentFilters: function () {
            const url = new URL(window.location.href);
            const filters = {};

            url.searchParams.forEach((value, key) => {
                if (key.indexOf('filter_') !== 0) {
                    return;
                }

                if (key.slice(-2) === '[]') {
                    const name = key.slice(0, -2);

                    filters[name] = filters[name] || [];
                    filters[name].push(value);

                    return;
                }

                filters[key] = value;
            });

            return filters;
        },

        /* ========================================================================
         * DATE PICKER
         * ======================================================================== */

        /**
         * Handle date picker toggle click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onDatePickerToggle: function (e) {
            e.preventDefault();
            e.stopPropagation();

            const $picker = $(e.currentTarget).closest('.reports-date-picker');
            const $dropdown = $picker.find('.reports-date-picker-dropdown');

            $('.reports-date-picker-dropdown').not($dropdown).hide();
            $('.reports-date-picker-toggle').not(e.currentTarget).attr('aria-expanded', 'false');

            $dropdown.toggle();
            $(e.currentTarget).attr('aria-expanded', $dropdown.is(':visible') ? 'true' : 'false');
        },

        /**
         * Handle preset button click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onPresetClick: function (e) {
            e.preventDefault();

            const $button = $(e.currentTarget);
            const preset = $button.data('preset');
            const $picker = $button.closest('.reports-date-picker');

            $picker.find('.reports-date-preset').removeClass('active');
            $button.addClass('active');

            if (preset === 'custom') {
                $picker.find('.reports-date-picker-presets').hide();
                $picker.find('.reports-date-picker-custom').show();
            } else {
                this.applyDateRange(preset);
            }
        },

        /**
         * Handle apply custom date button click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onApplyCustomDate: function (e) {
            e.preventDefault();

            const $picker = $(e.currentTarget).closest('.reports-date-picker');
            const startDate = $picker.find('.reports-date-start').val();
            const endDate = $picker.find('.reports-date-end').val();

            if (startDate && endDate) {
                this.applyDateRange('custom', startDate, endDate);
            }
        },

        /**
         * Handle cancel custom date button click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onCancelCustomDate: function (e) {
            e.preventDefault();

            const $picker = $(e.currentTarget).closest('.reports-date-picker');

            $picker.find('.reports-date-picker-custom').hide();
            $picker.find('.reports-date-picker-presets').show();
            $picker.find('.reports-date-picker-dropdown').hide();
        },

        /**
         * Handle document click (close open dropdowns)
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onDocumentClick: function (e) {
            if (!$(e.target).closest('.reports-date-picker').length) {
                $('.reports-date-picker-dropdown').hide();
                $('.reports-date-picker-custom').hide();
                $('.reports-date-picker-presets').show();
                $('.reports-date-picker-toggle').attr('aria-expanded', 'false');
            }
        },

        /**
         * Apply a date range and reload the page
         *
         * @param {string}  preset    - Date preset key
         * @param {string=} startDate - Custom start date (YYYY-MM-DD)
         * @param {string=} endDate   - Custom end date (YYYY-MM-DD)
         * @returns {void}
         */
        applyDateRange: function (preset, startDate, endDate) {
            const url = new URL(window.location.href);

            url.searchParams.set('date_preset', preset);

            if (preset === 'custom' && startDate && endDate) {
                url.searchParams.set('date_start', startDate);
                url.searchParams.set('date_end', endDate);
            } else {
                url.searchParams.delete('date_start');
                url.searchParams.delete('date_end');
            }

            window.location.href = url.toString();
        },

        /* ========================================================================
         * CHARTS
         * ======================================================================== */

        /**
         * Initialize all chart components
         *
         * @returns {void}
         */
        initCharts: function () {
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not loaded');
                return;
            }

            $('.reports-chart-canvas').each((index, element) => {
                const $canvas = $(element);
                const chartId = $canvas.data('chart-id');
                const chartConfig = $canvas.data('chart-config');

                if (chartConfig && chartId) {
                    // Store the original config for refresh preservation
                    this.chartConfigs[chartId] = JSON.parse(JSON.stringify(chartConfig));
                    this.createChart(element, chartId, chartConfig);
                }
            });
        },

        /**
         * Create a Chart.js instance
         *
         * @param {HTMLCanvasElement} canvas  - Canvas element
         * @param {string}            chartId - Chart identifier
         * @param {Object}            config  - Chart.js configuration
         * @returns {void}
         */
        createChart: function (canvas, chartId, config) {
            if (this.charts[chartId]) {
                this.charts[chartId].destroy();
            }

            const ctx = canvas.getContext('2d');

            if (config.data && config.data.datasets) {
                // The stored copy stays as the server sent it. A refresh is
                // styled from that, so what the report left to the script
                // is worked out again from the new data -- not frozen at
                // what it was for the old.
                config.data.datasets = config.data.datasets.map((dataset, index) => this.styleDataset(dataset, config.type, index));
            }

            const options = $.extend(true, {
                responsive: true,
                maintainAspectRatio: false,
                // The pointer anywhere over a bucket reads that bucket: no
                // hunting for the line.
                interaction: {mode: 'index', intersect: false},
                plugins: {
                    legend: {
                        display: config.data.datasets && config.data.datasets.length > 1,
                        position: 'top',
                        align: 'end',
                        labels: {usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, color: '#5c5f66'}
                    },
                    tooltip: {
                        backgroundColor: '#1f2124',
                        titleColor: '#fff',
                        bodyColor: '#e6e6e8',
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: config.data.datasets && config.data.datasets.length > 1,
                        usePointStyle: true,
                        boxPadding: 4
                    }
                }
            }, config.options || {});

            if (config.type === 'line' || config.type === 'bar') {
                // A month of days is thirty labels, and thirty labels turned
                // on their side is a fence under the chart. A handful, read
                // level, with the grid kept to the faint horizontal lines
                // that are actually used to read a value off.
                options.scales = options.scales || {
                    x: {
                        grid: {display: false},
                        border: {display: false},
                        ticks: {autoSkip: true, maxTicksLimit: 8, maxRotation: 0, color: '#6b6f76'}
                    },
                    y: {
                        beginAtZero: true,
                        grid: {color: '#eeeef0'},
                        border: {display: false},
                        ticks: {maxTicksLimit: 6, color: '#6b6f76', padding: 8}
                    }
                };
            }

            this.charts[chartId] = new Chart(ctx, {
                type: config.type,
                data: config.data,
                options: options
            });

            this.markEmptyChart(canvas, config.type, config.data);
        },

        /**
         * The report's look for one dataset, where the dataset says nothing
         *
         * By the dataset's own type when it has one, so bars and a line
         * drawn together each look like themselves. A colour the dataset
         * gives -- one, or one per bar -- is kept, and is what a bar turns
         * on hover as well.
         *
         * @param {Object} dataset - Chart.js dataset
         * @param {string} type    - The chart's type
         * @param {number} index   - Its place among the datasets
         * @returns {Object} The dataset
         */
        styleDataset: function (dataset, type, index) {
            const defaultColors = cfg.chartDefaults?.colors || [
                '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
            ];
            const color = defaultColors[index % defaultColors.length];
            const kind = dataset.type || type;

            if (kind === 'line' || kind === 'area') {
                dataset.borderColor = dataset.borderColor || color;

                // A wash under the line that fades out towards the
                // axis: full enough near the line to read as a
                // shape, gone by the bottom so the grid shows
                // through. A flat tint made the area a slab.
                dataset.backgroundColor = dataset.backgroundColor || this.fadeUnder(dataset.borderColor);
                dataset.tension = dataset.tension !== undefined ? dataset.tension : 0.4;
                dataset.fill = dataset.fill !== false;
                dataset.borderWidth = dataset.borderWidth !== undefined ? dataset.borderWidth : 2.5;

                // No dot on every point -- thirty of them is a
                // string of beads. One appears under the pointer.
                dataset.pointRadius = dataset.pointRadius !== undefined ? dataset.pointRadius : 0;
                dataset.pointHoverRadius = dataset.pointHoverRadius !== undefined ? dataset.pointHoverRadius : 5;
                dataset.pointHoverBackgroundColor = dataset.pointHoverBackgroundColor || '#fff';
                dataset.pointHoverBorderWidth = dataset.pointHoverBorderWidth !== undefined ? dataset.pointHoverBorderWidth : 2.5;
            } else if (kind === 'bar') {
                const own = dataset.backgroundColor;

                // One colour for one series. The palette is for
                // telling series apart, and painted across the bars
                // of a single series it made a rainbow of months.
                // The same fade as under a line, the other way up:
                // solid at the top of the bar, lighter at its foot,
                // so a few bars on a wide chart read as shapes
                // rather than blocks.
                dataset.backgroundColor = own || this.fadeDown(color);

                // A bar the report coloured -- the best month picked out
                // from its tinted neighbours -- keeps its colour under
                // the pointer rather than turning the palette's.
                dataset.hoverBackgroundColor = dataset.hoverBackgroundColor || own || color;
                dataset.borderRadius = dataset.borderRadius !== undefined ? dataset.borderRadius : 8;
                dataset.borderSkipped = dataset.borderSkipped !== undefined ? dataset.borderSkipped : false;

                // Wide enough to look deliberate when there are only
                // four or five of them, capped so twelve do not
                // become a wall.
                dataset.maxBarThickness = dataset.maxBarThickness !== undefined ? dataset.maxBarThickness : 64;
                dataset.categoryPercentage = dataset.categoryPercentage !== undefined ? dataset.categoryPercentage : 0.6;
            } else if (kind === 'pie' || kind === 'doughnut') {
                dataset.backgroundColor = dataset.backgroundColor || defaultColors;
            }

            return dataset;
        },

        /**
         * Say so when a chart has nothing in it
         *
         * A line chart of noughts draws a flat line along the bottom and a
         * scale from 0 to 1.0, which looks like a result. It is the absence
         * of one, so the chart steps aside for a sentence.
         *
         * @param {HTMLCanvasElement} canvas - Canvas element
         * @param {string}            type   - Chart type
         * @param {Object}            data   - Chart.js data
         * @returns {void}
         */
        markEmptyChart: function (canvas, type, data) {
            const datasets = (data && data.datasets) || [];
            const empty = datasets.every((dataset) => (dataset.data || []).every((value) => {
                const number = typeof value === 'object' && value !== null ? value.y : value;

                return !Number(number);
            }));

            $(canvas).closest('.reports-chart-container')
                .toggleClass('reports-chart-container--empty', empty)
                .attr('data-empty-text', empty ? this.i18n('noChartData') : null);
        },

        /**
         * A bar's fill: the colour at its top, softer towards its foot
         *
         * @param {string} color - The series colour (hex)
         * @returns {Function|string} A scriptable background, or the colour
         */
        fadeDown: function (color) {
            const self = this;

            if (typeof color !== 'string' || color.charAt(0) !== '#') {
                return color;
            }

            return function (context) {
                const chart = context.chart;
                const area = chart.chartArea;

                if (!area) {
                    return color;
                }

                const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);

                gradient.addColorStop(0, self.hexToRgba(color, 1));
                gradient.addColorStop(1, self.hexToRgba(color, 0.55));

                return gradient;
            };
        },

        /**
         * A fill that fades from a colour to nothing, top to bottom
         *
         * Returned as a function, which Chart.js calls once it knows how
         * tall the plot is -- the gradient has to span the plot, and that
         * is not known until the chart has been laid out.
         *
         * @param {string} color - The line's colour (hex)
         * @returns {Function|string} A scriptable background, or a flat tint
         */
        fadeUnder: function (color) {
            const self = this;

            if (typeof color !== 'string' || color.charAt(0) !== '#') {
                return color;
            }

            return function (context) {
                const chart = context.chart;
                const area = chart.chartArea;

                // Not laid out yet: a flat tint for the first pass.
                if (!area) {
                    return self.hexToRgba(color, 0.12);
                }

                const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);

                gradient.addColorStop(0, self.hexToRgba(color, 0.28));
                gradient.addColorStop(0.6, self.hexToRgba(color, 0.08));
                gradient.addColorStop(1, self.hexToRgba(color, 0));

                return gradient;
            };
        },

        /**
         * Convert hex color to rgba
         *
         * @param {string} hex   - Hex color (e.g., '#3b82f6')
         * @param {number} alpha - Alpha value (0-1)
         * @returns {string} RGBA color string
         */
        hexToRgba: function (hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
        },

        /* ========================================================================
         * TABLES
         * ======================================================================== */

        /**
         * Initialize all table components
         *
         * @returns {void}
         */
        initSparklines: function () {
            if (typeof Chart === 'undefined') {
                return;
            }

            $('[data-sparkline]').each((index, element) => {
                let points;

                try {
                    points = JSON.parse($(element).attr('data-sparkline'));
                } catch (e) {
                    return;
                }

                if (!Array.isArray(points) || points.length < 2) {
                    return;
                }

                const direction = $(element).data('direction');
                const colour = direction === 'down' ? '#d63638' : (direction === 'up' ? '#00a32a' : '#787c82');

                new Chart(element.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: points.map(() => ''),
                        datasets: [{
                            data: points,
                            borderColor: colour,
                            borderWidth: 1.5,
                            fill: false,
                            pointRadius: 0,
                            tension: 0.35,
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,

                        // No axes, no legend, no tooltip: it is a shape, not a
                        // reading. Anyone who wants the values wants the chart
                        // component, which has all three.
                        plugins: {legend: {display: false}, tooltip: {enabled: false}},
                        scales: {x: {display: false}, y: {display: false}},
                        animation: false,
                    },
                });
            });
        },

        initTables: function () {
            $('.reports-table-wrapper').each((index, element) => {
                const $wrapper = $(element);
                const componentId = $wrapper.data('component-id');

                if (componentId) {
                    // Try to get config from data attribute first (PHP-provided)
                    const dataConfig = $wrapper.data('table-config');
                    if (dataConfig) {
                        this.tableConfigs[componentId] = dataConfig;
                    } else {
                        // Fall back to extracting from DOM
                        this.extractTableConfig($wrapper, componentId);
                    }
                }
            });

            $('.reports-table-container[data-paginated="true"]').each((index, element) => {
                const $container = $(element);

                $container.data('current-page', 1);
                this.applyTablePagination($container);
            });
        },

        /**
         * Extract table configuration from DOM for refresh (fallback)
         *
         * @param {jQuery} $wrapper    - Table wrapper element
         * @param {string} componentId - Component identifier
         * @returns {void}
         */
        extractTableConfig: function ($wrapper, componentId) {
            const $table = $wrapper.find('.reports-table');
            const $container = $wrapper.find('.reports-table-container');
            const columns = [];
            const rowActions = [];

            // Extract column info from headers
            $table.find('thead th').each(function () {
                const $th = $(this);
                const columnKey = $th.data('column');

                // Skip the actions column
                if ($th.hasClass('reports-table-actions-col')) {
                    return;
                }

                if (columnKey) {
                    columns.push({
                        key: columnKey,
                        label: $th.text().trim(),
                        sortable: $th.hasClass('sortable'),
                        format: '' // Can't determine format from DOM
                    });
                }
            });

            // Extract row actions from first row (if exists)
            const $firstRowActions = $table.find('tbody tr:first .reports-row-actions-wrap a');
            $firstRowActions.each(function () {
                const $link = $(this);
                const classes = $link.attr('class') || '';
                const keyMatch = classes.match(/reports-row-action-(\S+)/);
                const actionKey = keyMatch ? keyMatch[1] : '';

                if (actionKey && actionKey !== 'row') {
                    rowActions.push({
                        key: actionKey,
                        label: $link.text().trim(),
                        url: $link.attr('href') || '#',
                        class: $link.attr('class')?.replace(/reports-row-action[^\s]*/g, '').trim() || '',
                        confirm: $link.attr('onclick')?.match(/confirm\('([^']+)'\)/)?.[1] || '',
                        target: $link.attr('target') || ''
                    });
                }
            });

            // Store configuration
            this.tableConfigs[componentId] = {
                columns: columns,
                rowActions: rowActions,
                emptyMessage: $wrapper.find('.reports-table-empty p').text() || this.i18n('noData'),
                paginated: $container.data('paginated') === true || $container.data('paginated') === 'true',
                perPage: parseInt($container.data('per-page'), 10) || 10
            };
        },

        /**
         * Handle table column sort click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onTableSort: function (e) {
            const $th = $(e.currentTarget);
            const $table = $th.closest('.reports-table');
            const columnIndex = $th.index();
            const isAsc = $th.hasClass('sorted-asc');

            $table.find('th').removeClass('sorted-asc sorted-desc');
            $th.addClass(isAsc ? 'sorted-desc' : 'sorted-asc');

            const $tbody = $table.find('tbody');
            const rows = $tbody.find('tr').toArray();

            rows.sort((a, b) => {
                const aVal = $(a).find('td').eq(columnIndex).text().trim();
                const bVal = $(b).find('td').eq(columnIndex).text().trim();

                const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ''));
                const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ''));

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return isAsc ? bNum - aNum : aNum - bNum;
                }

                return isAsc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
            });

            $tbody.append(rows);
        },

        /**
         * Handle table pagination button click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onTablePage: function (e) {
            const $button = $(e.currentTarget);

            if ($button.prop('disabled')) {
                return;
            }

            const page = parseInt($button.data('page'), 10);
            const $container = $button.closest('.reports-table-container');

            $container.data('current-page', page);
            this.applyTablePagination($container);
        },

        /**
         * Apply pagination to a table
         *
         * @param {jQuery} $container - Table container element
         * @returns {void}
         */
        applyTablePagination: function ($container) {
            const $table = $container.find('.reports-table');
            const $rows = $table.find('tbody tr');
            const currentPage = $container.data('current-page') || 1;
            const perPage = parseInt($container.data('per-page'), 10) || 10;
            const totalRows = $rows.length;
            const totalPages = Math.ceil(totalRows / perPage);
            const start = (currentPage - 1) * perPage;
            const end = start + perPage;
            const showing = Math.min(end, totalRows);

            // Hide all rows, then show only the current page
            $rows.hide().slice(start, end).show();

            // Get or create pagination container
            let $pagination = $container.find('.reports-table-pagination');
            if (!$pagination.length && totalPages > 1) {
                $pagination = $('<div class="reports-table-pagination"><span class="reports-table-info"></span><div class="reports-table-pages"></div></div>');
                $container.append($pagination);
            }

            if (!$pagination.length) {
                return;
            }

            // Update info text
            $pagination.find('.reports-table-info').text(
                this.i18n('showing', start + 1, showing, totalRows)
            );

            // Build page buttons
            const $pages = $pagination.find('.reports-table-pages');
            $pages.empty();

            // Only show pagination controls if there's more than one page
            if (totalPages <= 1) {
                $pagination.hide();
                return;
            }

            $pagination.show();

            // Previous button
            const $prevBtn = $('<button type="button" class="button">Previous</button>')
                .data('page', currentPage - 1)
                .prop('disabled', currentPage <= 1);
            $pages.append($prevBtn);

            // Page number buttons (with ellipsis for many pages)
            const maxVisiblePages = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            // Adjust start if we're near the end
            if (endPage - startPage < maxVisiblePages - 1) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            // First page + ellipsis
            if (startPage > 1) {
                $pages.append(
                    $('<button type="button" class="button">1</button>').data('page', 1)
                );
                if (startPage > 2) {
                    $pages.append('<span class="ellipsis">…</span>');
                }
            }

            // Page numbers
            for (let i = startPage; i <= endPage; i++) {
                const $pageBtn = $('<button type="button" class="button"></button>')
                    .text(i)
                    .data('page', i);

                if (i === currentPage) {
                    $pageBtn.addClass('button-primary').prop('disabled', true);
                }

                $pages.append($pageBtn);
            }

            // Ellipsis + last page
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    $pages.append('<span class="ellipsis">…</span>');
                }
                $pages.append(
                    $('<button type="button" class="button"></button>')
                        .text(totalPages)
                        .data('page', totalPages)
                );
            }

            // Next button
            const $nextBtn = $('<button type="button" class="button">Next</button>')
                .data('page', currentPage + 1)
                .prop('disabled', currentPage >= totalPages);
            $pages.append($nextBtn);
        },

        /* ========================================================================
         * EXPORTS
         * ======================================================================== */

        /**
         * Handle export button click
         *
         * @param {Event} e - Click event
         * @returns {void}
         */
        onExportClick: function (e) {
            e.preventDefault();

            const $button = $(e.currentTarget);
            const $card = $button.closest('.reports-export-card');
            const exportId = $button.data('export-id');
            const reportId = $button.data('report-id');

            if ($button.prop('disabled')) {
                return;
            }

            const filters = this.gatherExportFilters($card);

            this.startExport(reportId, exportId, filters, $card, $button);
        },

        /**
         * Gather filter values from export card
         *
         * @param {jQuery} $card - Export card element
         * @returns {Object} Filter values keyed by filter name
         */
        gatherExportFilters: function ($card) {
            const filters = {};

            $card.find('.reports-filter-input').each(function () {
                const $field = $(this);
                const name = $field.attr('name');

                if (!name) {
                    return;
                }

                const filterKey = name.replace(/^filter_/, '').replace(/\[]$/, '');

                if ($field.is(':checkbox')) {
                    if (!filters[filterKey]) {
                        filters[filterKey] = [];
                    }
                    if ($field.is(':checked')) {
                        filters[filterKey].push($field.val());
                    }
                } else if ($field.is('select[multiple]')) {
                    filters[filterKey] = $field.val() || [];
                } else {
                    const val = $field.val();
                    if (val) {
                        filters[filterKey] = val;
                    }
                }
            });

            return filters;
        },

        /**
         * Start an export process
         *
         * @param {string} reportId - Report identifier
         * @param {string} exportId - Export identifier
         * @param {Object} filters  - Filter values
         * @param {jQuery} $card    - Export card element
         * @param {jQuery} $button  - Export button element
         * @returns {void}
         */
        startExport: function (reportId, exportId, filters, $card, $button) {
            const $progress = $card.find('.reports-export-progress');
            const $progressFill = $card.find('.reports-export-progress-fill');
            const $progressLabel = $card.find('.reports-export-progress-label');
            const $progressPercent = $card.find('.reports-export-progress-percent');

            $button.prop('disabled', true);
            $button.find('.button-text').text(this.i18n('exporting'));
            $progress.show();
            $progressFill.css('width', '0%');
            $progressLabel.text(this.i18n('preparing'));
            $progressPercent.text('0%');

            const requestData = {
                report_id: reportId,
                export_id: exportId,
                filters: filters,
                date_preset: this.getCurrentDatePreset(),
                date_start: this.getCurrentDateStart(),
                date_end: this.getCurrentDateEnd()
            };

            rest({
                url: cfg.restUrl + 'export/start',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(requestData),
                success: (response) => {
                    if (response.success) {
                        this.processExportBatches(
                            response.export_token,
                            response.total_items,
                            response.batch_size,
                            0,
                            $card,
                            $button
                        );
                    } else {
                        this.handleExportError(response.message || this.i18n('exportFailed'), $card, $button);
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON ? xhr.responseJSON.message : this.i18n('exportFailed');
                    this.handleExportError(message, $card, $button);
                }
            });
        },

        /**
         * Process export batches recursively
         *
         * @param {string} exportToken  - Export session token
         * @param {number} totalItems   - Total items to export
         * @param {number} batchSize    - Items per batch
         * @param {number} currentBatch - Current batch index
         * @param {jQuery} $card        - Export card element
         * @param {jQuery} $button      - Export button element
         * @returns {void}
         */
        processExportBatches: function (exportToken, totalItems, batchSize, currentBatch, $card, $button) {
            const $progressFill = $card.find('.reports-export-progress-fill');
            const $progressLabel = $card.find('.reports-export-progress-label');
            const $progressPercent = $card.find('.reports-export-progress-percent');

            rest({
                url: cfg.restUrl + 'export/batch',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    export_token: exportToken,
                    batch: currentBatch
                }),
                success: (response) => {
                    if (!response.success) {
                        this.handleExportError(response.message || this.i18n('batchFailed'), $card, $button);
                        return;
                    }

                    const percent = Math.round((response.processed_items / response.total_items) * 100);

                    $progressFill.css('width', percent + '%');
                    $progressPercent.text(percent + '%');
                    $progressLabel.text(this.i18n('processing', response.processed_items, response.total_items));

                    if (response.is_complete) {
                        $progressLabel.text(this.i18n('complete'));
                        $progressFill.css('width', '100%');
                        $progressPercent.text('100%');

                        setTimeout(() => {
                            window.location.href = response.download_url;
                            this.resetExportUI($card, $button);
                        }, 500);
                    } else {
                        this.processExportBatches(
                            exportToken,
                            totalItems,
                            batchSize,
                            currentBatch + 1,
                            $card,
                            $button
                        );
                    }
                },
                error: (xhr) => {
                    const message = xhr.responseJSON ? xhr.responseJSON.message : this.i18n('batchFailed');
                    this.handleExportError(message, $card, $button);
                }
            });
        },

        /**
         * Handle export error
         *
         * @param {string} message - Error message
         * @param {jQuery} $card   - Export card element
         * @param {jQuery} $button - Export button element
         * @returns {void}
         */
        handleExportError: function (message, $card, $button) {
            const $progressLabel = $card.find('.reports-export-progress-label');

            $progressLabel.text(this.i18n('error') + ': ' + message).addClass('error');

            setTimeout(() => {
                this.resetExportUI($card, $button);
            }, 3000);
        },

        /**
         * Reset export UI to initial state
         *
         * @param {jQuery} $card   - Export card element
         * @param {jQuery} $button - Export button element
         * @returns {void}
         */
        resetExportUI: function ($card, $button) {
            const $progress = $card.find('.reports-export-progress');
            const $progressLabel = $card.find('.reports-export-progress-label');

            $button.prop('disabled', false);
            $button.find('.button-text').text(this.i18n('download'));
            $progress.hide();
            $progressLabel.removeClass('error');
        }

    };

    /**
     * Initialize on document ready
     */
    $(function () {
        ReportsController.init();
    });

    /**
     * Expose controller globally
     */
    window.ReportsController = ReportsController;

})(jQuery);