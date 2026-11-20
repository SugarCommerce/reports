/**
 * A report page as PHP draws it, Chart.js and apiFetch stand-ins, and
 * enough layout for jsdom to say what is on screen.
 */

import { vi } from 'vitest';

import { initReports } from '../../../assets/js/reports/init';

export const STRINGS = {
	loading: 'Loading...',
	error: 'Error',
	noData: 'No data available',
	noChartData: 'Nothing to chart for this period yet.',
	exporting: 'Exporting...',
	preparing: 'Preparing export...',
	processing: 'Processing %1$d / %2$d',
	complete: 'Export complete!',
	download: 'Download CSV',
	exportFailed: 'Export failed',
	batchFailed: 'Batch failed',
	updatedJustNow: 'Updated just now',
	updatedSeconds: 'Updated %ds ago',
	updatedMinutes: 'Updated %dm ago',
	updatedHours: 'Updated %dh ago',
	showing: 'Showing %1$d-%2$d of %3$d',
};

export const ARROWS = {
	up: '<svg class="sugarcommerce-icon">up</svg>',
	down: '<svg class="sugarcommerce-icon">down</svg>',
	neutral: '<svg class="sugarcommerce-icon">level</svg>',
};

export const SETTINGS = {
	restUrl: 'https://example.test/wp-json/sugarcommerce-reports/v1/',
	restNonce: 'n0nce',
	reportId: 'sales',
	defaultPreset: 'last_30',
	i18n: STRINGS,
	changeIcons: ARROWS,
	chartDefaults: { colors: [ '#3b82f6', '#10b981', '#f59e0b' ] },
};

/**
 * Layout, as far as `:visible` goes: an element takes up room unless it, or
 * something it is in, is `display: none`. jsdom lays nothing out, so every
 * element would otherwise be invisible.
 */
export function layout() {
	const shown = ( element ) => {
		for ( let node = element; node; node = node.parentElement ) {
			if ( window.getComputedStyle( node ).display === 'none' ) {
				return 0;
			}
		}

		return element.isConnected ? 10 : 0;
	};

	Object.defineProperty( window.HTMLElement.prototype, 'offsetWidth', {
		configurable: true,
		get() {
			return shown( this );
		},
	} );
	Object.defineProperty( window.HTMLElement.prototype, 'offsetHeight', {
		configurable: true,
		get() {
			return shown( this );
		},
	} );
}

/**
 * Chart.js's Chart, keeping what it was asked to draw.
 */
export class FakeChart {
	static made = [];

	constructor( canvas, config ) {
		this.canvas = canvas;
		this.config = config;
		this.data = config.data;
		this.destroyed = false;
		this.updates = [];
		FakeChart.made.push( this );
	}

	destroy() {
		this.destroyed = true;
	}

	update( mode ) {
		this.updates.push( mode );
	}
}

/**
 * An apiFetch that answers by route.
 *
 * @param {Object} routes Path after the REST base => ( request ) => answer
 *                        (a value, or a rejected promise).
 * @return {Function} The stand-in, with `calls`.
 */
export function fakeApiFetch( routes = {} ) {
	const calls = [];
	const apiFetch = vi.fn( ( request ) => {
		calls.push( request );

		const path = request.url
			.replace( SETTINGS.restUrl, '' )
			.replace( /\?.*$/, '' );
		const answer = routes[ path ];

		if ( ! answer ) {
			return Promise.reject( {
				code: 'rest_no_route',
				message: 'No route.',
				data: { status: 404 },
			} );
		}

		return Promise.resolve().then( () => answer( request ) );
	} );

	apiFetch.calls = calls;

	return apiFetch;
}

/**
 * Let every pending promise settle.
 *
 * @return {Promise<void>} Settles after them.
 */
export const flush = async () => {
	for ( let i = 0; i < 10; i++ ) {
		await Promise.resolve();
	}
};

/**
 * A chart's configuration, as ChartRenderer writes it.
 *
 * @param {Object} overrides Anything to change.
 * @return {Object} The configuration.
 */
export const chartConfig = ( overrides = {} ) => ( {
	type: 'line',
	data: {
		labels: [ 'Mon', 'Tue', 'Wed' ],
		datasets: [ { label: 'Orders', data: [ 1, 3, 2 ] } ],
	},
	options: {},
	...overrides,
} );

/**
 * Escape for an attribute.
 *
 * @param {*} value A value.
 * @return {string} It, JSON-encoded and escaped.
 */
const attr = ( value ) =>
	JSON.stringify( value ).replace( /&/g, '&amp;' ).replace( /"/g, '&quot;' );

/**
 * A table's rows.
 *
 * @param {number} count How many.
 * @return {string} The rows' markup.
 */
const tableRows = ( count ) =>
	Array.from(
		{ length: count },
		( unused, i ) =>
			`<tr><td data-column="number">PG-${ 1000 + i }</td><td data-column="customer">Customer ${ i }</td><td data-column="total">$${ i + 1 }.00</td></tr>`
	).join( '' );

/**
 * A report page.
 *
 * @param {Object}  options             Its parts.
 * @param {string}  options.reportId    The report's id.
 * @param {number}  options.autoRefresh Its interval, in seconds.
 * @param {number}  options.rows        How many orders the table has.
 * @param {number}  options.perPage     How many it shows to a page.
 * @param {boolean} options.tableConfig Whether PHP wrote data-table-config.
 * @param {Object}  options.chart       The chart's configuration.
 * @return {string} The page's markup.
 */
export function reportPage( {
	reportId = 'sales',
	autoRefresh = 0,
	rows = 12,
	perPage = 5,
	tableConfig = true,
	chart = chartConfig(),
} = {} ) {
	const config = {
		columns: [
			{ key: 'number', label: 'Order', format: '' },
			{ key: 'customer', label: 'Customer', format: '' },
			{ key: 'total', label: 'Total', format: '' },
		],
		rowActions: [],
		emptyMessage: 'No orders in this range.',
		paginated: true,
		perPage,
	};

	return `
<div class="notice notice-info stray-before"><p>Before</p></div>
<div class="wrap reports-wrap" data-report-id="${ reportId }">
	<div class="reports-header"><div class="notice notice-warning stray-inside"><p>Inside</p></div></div>
	<div class="reports-notices"><div class="notice kept"><p>Kept</p></div></div>
	<div class="reports-controls-bar">
		<div class="reports-filter-bar">
			<form class="reports-filter-form" method="get">
				<input type="hidden" name="page" value="reports">
				<select name="filter_status" class="status"><option value="">Any</option><option value="complete">Complete</option></select>
				<button type="submit" class="button reports-filter-submit">Filter</button>
			</form>
		</div>
		<div class="reports-date-picker" data-report-id="${ reportId }">
			<button type="button" class="reports-date-picker-toggle button" aria-expanded="false"><span class="reports-date-picker-label">Last 30 days</span></button>
			<div class="reports-date-picker-dropdown" style="display: none;">
				<div class="reports-date-picker-presets">
					<button type="button" class="reports-date-preset" data-preset="today">Today</button>
					<button type="button" class="reports-date-preset active" data-preset="last_30">Last 30 days</button>
					<button type="button" class="reports-date-preset" data-preset="custom">Custom</button>
				</div>
				<div class="reports-date-picker-custom" style="display: none;">
					<input type="date" class="reports-date-start" value="">
					<input type="date" class="reports-date-end" value="">
					<button type="button" class="button reports-date-picker-cancel">Cancel</button>
					<button type="button" class="button button-primary reports-date-picker-apply">Apply</button>
				</div>
			</div>
		</div>
		<div class="reports-refresh-controls" data-auto-refresh="${ autoRefresh }" data-report-id="${ reportId }">
			<button type="button" class="button reports-refresh-button">Refresh</button>
			<span class="reports-last-updated-text"></span>
		</div>
	</div>
	<div class="reports-content">
		<div class="reports-tile" data-component-id="earnings">
			<div class="reports-tile-value">$1,136.29</div>
			<div class="reports-tile-change change-down">${ ARROWS.down } 7.2%</div>
		</div>
		<div class="reports-chart-wrapper" data-component-id="over_time">
			<div class="reports-chart-container" style="height: 300px;">
				<canvas class="reports-chart-canvas" data-chart-id="over_time" data-chart-config="${ attr( chart ) }"></canvas>
			</div>
		</div>
		<div class="reports-table-wrapper" data-component-id="orders_table"${ tableConfig ? ` data-table-config="${ attr( config ) }"` : '' }>
			<div class="reports-table-container" data-paginated="true" data-per-page="${ perPage }">
				<table class="reports-table">
					<thead><tr><th class="sortable" data-column="number">Order</th><th class="sortable" data-column="customer">Customer</th><th class="sortable" data-column="total">Total</th></tr></thead>
					<tbody>${ tableRows( rows ) }</tbody>
				</table>
				${ rows > perPage ? '<div class="reports-table-pagination"><span class="reports-table-info"></span><div class="reports-table-pages"></div></div>' : '' }
			</div>
		</div>
		<div class="reports-breakdown-wrapper" data-component-id="countries" data-component-type="breakdown">
			<ul class="reports-breakdown"><li class="reports-breakdown-row">Old</li></ul>
			<p class="reports-breakdown-empty" hidden>Nothing yet.</p>
		</div>
		<div class="reports-stat-list-wrapper" data-component-id="products" data-component-type="stat_list">
			<dl class="reports-stat-list"></dl>
			<p class="reports-empty">Nothing yet.</p>
		</div>
		<div class="reports-progress-wrapper" data-component-id="target" data-component-type="progress">
			<div class="reports-progress-track" role="progressbar" aria-valuenow="10"><div class="reports-progress-fill" style="width:10%"></div></div>
			<span class="reports-progress-percent">10%</span><span class="reports-progress-figures">$1 of $10</span>
		</div>
		<div class="reports-export-card" data-export-id="orders">
			<select name="filter_status" class="reports-filter-input"><option value="">All</option><option value="complete" selected>Complete</option></select>
			<div class="reports-export-progress" style="display: none;">
				<div class="reports-export-progress-fill"></div>
				<span class="reports-export-progress-label">Preparing...</span>
				<span class="reports-export-progress-percent">0%</span>
			</div>
			<button type="button" class="button button-primary reports-export-button" data-export-id="orders" data-report-id="${ reportId }"><span class="button-text">Export CSV</span></button>
		</div>
	</div>
</div>
<div class="notice notice-error stray-after"><p>After</p></div>
<fieldset class="metabox-prefs reports-screen-options" data-report="${ reportId }" data-tab="overview">
	<label><input type="checkbox" value="over_time" checked>Earnings over time</label>
	<label><input type="checkbox" value="countries" checked>Countries</label>
</fieldset>`;
}

/**
 * Every listener a report put on the document, so the next test starts
 * with none of them.
 */
const bound = [];

/**
 * Take the last report's listeners off the document, and its timers.
 */
export function cleanup() {
	while ( bound.length ) {
		document.removeEventListener( ...bound.pop() );
	}

	document.body.innerHTML = '';
}

/**
 * Start the report on a page, keeping what it binds.
 *
 * @param {Object} options For initReports().
 * @return {Object} The report's parts.
 */
export function start( options ) {
	const add = document.addEventListener;

	document.addEventListener = function ( ...args ) {
		bound.push( args );

		return add.apply( this, args );
	};

	try {
		return initReports( document, options );
	} finally {
		document.addEventListener = add;
	}
}

/**
 * Draw a page and start the report on it.
 *
 * @param {Object} options          The page's parts (reportPage()), and:
 * @param {Object} options.routes   apiFetch's answers.
 * @param {string} options.href     The address.
 * @param {Object} options.settings Settings to lay over SETTINGS.
 * @return {Object} The parts, the stand-ins and what was navigated to.
 */
export function startReport( options = {} ) {
	const {
		routes = {},
		href = 'https://example.test/wp-admin/admin.php?page=reports',
		settings = {},
		html,
	} = options;

	document.body.innerHTML = html ?? reportPage( options );
	FakeChart.made = [];

	const apiFetch = fakeApiFetch( routes );
	const navigated = [];
	const reload = vi.fn();
	const log = { error: vi.fn() };
	const parts = start( {
		settings: { ...SETTINGS, ...settings },
		apiFetch,
		Chart: FakeChart,
		href: () => href,
		navigate: ( address ) => navigated.push( address ),
		reload,
		log,
	} );

	return { ...parts, apiFetch, navigated, reload, log };
}

/**
 * Click an element the way a person would.
 *
 * @param {Element} element What to click.
 */
export const click = ( element ) =>
	element.dispatchEvent(
		new window.MouseEvent( 'click', { bubbles: true, cancelable: true } )
	);
