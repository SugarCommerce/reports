/**
 * Tests for the reports script.
 *
 * Fourteen hundred lines that nothing had ever executed. The PHP suite
 * renders the page and stops there, so everything the page does *after* it
 * loads — the auto-refresh, the date picker, the export polling, the table
 * paging — was covered by nobody looking at it in a browser and noticing.
 *
 * Two kinds of test here, and the split is deliberate:
 *
 * - Behaviour, for the parts that do not need a browser: URL reading, the
 *   escapers, the per-copy config lookup, colour conversion. These are run
 *   for real against a jQuery stub that matches nothing, which is a page with
 *   no reports on it — a legitimate state the script must survive.
 *
 * - Source, for invariants a stub cannot honestly check. Asserting that
 *   escapeHtml() escapes `<` against a stubbed document only proves the stub
 *   escapes `<`. What is worth pinning is where its output is allowed to go,
 *   since it does not escape quotes.
 *
 * Deliberately no jsdom: this library has no JavaScript dependencies and a
 * test suite is a poor reason to acquire the first one.
 */

'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const vm = require( 'vm' );

const file = path.join( __dirname, '..', '..', 'assets', 'js', 'reports.js' );
const source = fs.readFileSync( file, 'utf8' );

let failures = 0;

/**
 * Report a failure.
 *
 * @param {string} message What went wrong.
 */
function fail( message ) {
	console.error( '  ' + message );
	failures ++;
}

/**
 * Assert two values match.
 *
 * @param {*}      actual   What happened.
 * @param {*}      expected What should have.
 * @param {string} what     The name of the thing.
 */
function is( actual, expected, what ) {
	if ( actual !== expected ) {
		fail( `${ what }: expected ${ JSON.stringify( expected ) }, got ${ JSON.stringify( actual ) }` );
	}
}

/**
 * A jQuery that matches nothing.
 *
 * Every method returns the collection so chains complete, `length` is 0 and
 * `data()`/`attr()`/`val()` are undefined — which is the honest answer for an
 * empty set and the state the script hits on any admin page that is not a
 * report. A page where init() throws is a page where every later handler is
 * never bound, and the only symptom is that nothing works.
 *
 * @return {Function} The stub.
 */
function makeJQuery() {
	const calls = [];

	const collection = new Proxy( function () {}, {
		get( target, name ) {
			if ( 'length' === name ) {
				return 0;
			}

			if ( 'then' === name || Symbol.toPrimitive === name || 'constructor' === name ) {
				return undefined;
			}

			return function () {
				calls.push( name );

				return collection;
			};
		},
	} );

	const $ = function ( thing ) {
		// $(function () {…}) is the ready handler. Run it, because that is
		// what a browser does and it is the path init() is reached by.
		if ( 'function' === typeof thing ) {
			thing();
		}

		return collection;
	};

	$.ajax = () => collection;
	$.each = ( items, each ) => {
		Object.keys( items || {} ).forEach( ( key ) => each( key, items[ key ] ) );
	};
	$.extend = Object.assign;
	$.calls = calls;

	return $;
}

/**
 * Load the script with a given environment.
 *
 * @param {Object} overrides Anything to put in the context.
 *
 * @return {Object} The context after loading.
 */
function load( overrides ) {
	const context = Object.assign(
		{
			// Quiet: the script warns about Chart.js on every load, which is
			// correct — there is no Chart.js here — and six copies of it
			// would bury a real failure.
			console: Object.assign( Object.create( console ), { log() {}, warn() {}, error() {} } ),
			URL,
			URLSearchParams,
			Date,
			Math,
			JSON,
			parseInt,
			parseFloat,
			isNaN,
			setTimeout: () => 0,
			clearTimeout: () => {},
			setInterval: () => 0,
			clearInterval: () => {},
			jQuery: makeJQuery(),
			document: {
				currentScript: { id: 'sugarcommerce-reports-js' },
				addEventListener() {},
				createElement: () => ( {} ),
				hidden: false,
			},
		},
		overrides
	);

	context.window = context.window || {};
	context.window.location = context.window.location || { href: 'https://example.test/wp-admin/admin.php?page=reports' };
	context.globalThis = context;

	vm.createContext( context );
	vm.runInContext( source, context, { filename: 'reports.js' } );

	return context;
}

/* -------------------------------------------------------------------------
 * It loads, and init() survives a page with no reports on it.
 * ---------------------------------------------------------------------- */

let ctx;

try {
	ctx = load( {} );
} catch ( error ) {
	console.error( `  the script threw while loading: ${ error.message }` );
	process.exit( 1 );
}

const controller = ctx.window.ReportsController;

if ( ! controller ) {
	console.error( '  the script exposed no controller' );
	process.exit( 1 );
}

// The ready handler runs init(), so reaching here at all means init() did not
// throw. Assert it actually ran rather than inferring it.
if ( ! ctx.jQuery.calls.length ) {
	fail( 'init: nothing was bound, so the ready handler never ran' );
}

/* -------------------------------------------------------------------------
 * Each prefixed copy reads its own configuration.
 *
 * Strauss renames classes, not script handles or global keys, so two plugins
 * bundling this library land on one screen with two copies of reports.js and
 * one window. Resolving by the handle WordPress stamped on the executing
 * script is what stops the second copy answering with the first one's REST
 * namespace and nonce.
 * ---------------------------------------------------------------------- */

( function () {
	const shared = {
		'plugin-a-reports': { restUrl: '/a/', nonce: 'aaa' },
		'plugin-b-reports': { restUrl: '/b/', nonce: 'bbb' },
	};

	[ 'a', 'b' ].forEach( ( which ) => {
		const context = load( {
			window: { SugarCommerceReports: shared },
			document: {
				currentScript: { id: `plugin-${ which }-reports-js` },
				addEventListener() {},
				createElement: () => ( {} ),
				hidden: false,
			},
		} );

		// The config is closed over rather than exposed, so it is reached
		// through something that reads it.
		is(
			context.window.ReportsController.i18n( 'noData' ),
			'noData',
			`i18n survives copy ${ which } having no strings`
		);
	} );

	// The fallback path: no registry entry matches the handle, so the config
	// is the bare {} at the end of the chain. Every i18n() call used to be a
	// TypeError there — which is the one situation the fallback exists to
	// survive.
	const bare = load( {
		window: {},
		document: {
			currentScript: { id: 'some-other-plugin-js' },
			addEventListener() {},
			createElement: () => ( {} ),
			hidden: false,
		},
	} );

	if ( ! bare.window.ReportsController ) {
		fail( 'config: the script did not load without a handle registry' );
	}

	is( bare.window.ReportsController.i18n( 'noData' ), 'noData', 'i18n with no config at all' );

	// Substitution still works, since that is the reason it is a function.
	is(
		bare.window.ReportsController.i18n( '%1$s of %2$s', 'one', 'three' ),
		'one of three',
		'i18n: positional substitution'
	);
} )();

/* -------------------------------------------------------------------------
 * Reading the request.
 * ---------------------------------------------------------------------- */

( function () {
	const context = load( {
		window: {
			location: {
				href: 'https://example.test/wp-admin/admin.php?page=reports&tab=sales'
					+ '&date_preset=last_30&date_start=2026-01-01&date_end=2026-01-31'
					+ '&filter_status=complete&filter_gateway=stripe&orderby=name',
			},
		},
	} );

	const it = context.window.ReportsController;

	is( it.getCurrentTab(), 'sales', 'getCurrentTab' );
	is( it.getCurrentDatePreset(), 'last_30', 'getCurrentDatePreset' );
	is( it.getCurrentDateStart(), '2026-01-01', 'getCurrentDateStart' );
	is( it.getCurrentDateEnd(), '2026-01-31', 'getCurrentDateEnd' );

	const filters = it.getCurrentFilters();

	is( JSON.stringify( filters ), JSON.stringify( { filter_status: 'complete', filter_gateway: 'stripe' } ), 'getCurrentFilters' );

	// A multiselect arrives as repeated bracketed keys. Read one at a time,
	// each repeat overwrote the last and the refresh carried one status
	// where the page showed two.
	const multi = load( {
		window: {
			location: {
				href: 'https://example.test/wp-admin/admin.php?page=reports'
					+ '&filter_status%5B%5D=complete&filter_status%5B%5D=refunded&filter_gateway=stripe',
			},
		},
	} );

	is(
		JSON.stringify( multi.window.ReportsController.getCurrentFilters() ),
		JSON.stringify( { filter_status: [ 'complete', 'refunded' ], filter_gateway: 'stripe' } ),
		'getCurrentFilters with a multiselect'
	);

	// A URL with none of it must not invent values: an empty tab means "the
	// first one", and a made-up preset would silently change what is shown.
	const bare = load( { window: { location: { href: 'https://example.test/wp-admin/admin.php?page=reports' } } } );

	is( bare.window.ReportsController.getCurrentTab(), '', 'getCurrentTab with no tab' );
	is( JSON.stringify( bare.window.ReportsController.getCurrentFilters() ), '{}', 'getCurrentFilters with none' );

	// A missing date_preset means the report's own default, not a hardcoded
	// one. PHP reads default_preset from the report's config; the script used
	// to answer this_month regardless, so a report configuring anything else
	// got its own default on the first render and lost it on the first
	// refresh.
	const configured = load( {
		window: {
			SugarCommerceReports: { 'sugarcommerce-reports': { defaultPreset: 'last_7' } },
			location: { href: 'https://example.test/wp-admin/admin.php?page=reports' },
		},
	} );

	is( configured.window.ReportsController.getCurrentDatePreset(), 'last_7', 'getCurrentDatePreset: the report default' );
	is( bare.window.ReportsController.getCurrentDatePreset(), 'this_month', 'getCurrentDatePreset: the fallback' );
} )();

/* -------------------------------------------------------------------------
 * escapeJs, which writes into a JavaScript string inside an onclick.
 *
 * PHP does the same job with esc_js(), which runs addslashes() — all three of
 * quote, double quote and backslash. This escaped two of them, so a value
 * ending in a backslash escaped the closing quote instead of itself and
 * everything after it was code.
 * ---------------------------------------------------------------------- */

( function () {
	const escape = controller.escapeJs.bind( controller );

	is( escape( "it's" ), "it\\'s", 'escapeJs: single quote' );
	is( escape( 'say "hi"' ), 'say \\"hi\\"', 'escapeJs: double quote' );
	is( escape( 'a\\b' ), 'a\\\\b', 'escapeJs: backslash' );

	// The attack the missing backslash allowed: the trailing backslash used
	// to escape the quote the script closes with.
	const payload = 'x\\';
	const inside = "return confirm('" + escape( payload ) + "')";

	if ( ! inside.endsWith( "\\\\')" ) ) {
		fail( `escapeJs: a trailing backslash still breaks out — ${ inside }` );
	}

	// Not a string: handed back untouched rather than crashing on .replace.
	is( escape( 42 ), 42, 'escapeJs: a number is left alone' );
} )();

/* -------------------------------------------------------------------------
 * hexToRgba, which paints the fill under a chart line.
 * ---------------------------------------------------------------------- */

( function () {
	is( controller.hexToRgba( '#2271b1', 0.2 ), 'rgba(34, 113, 177, 0.2)', 'hexToRgba' );
	is( controller.hexToRgba( '#000000', 1 ), 'rgba(0, 0, 0, 1)', 'hexToRgba: black' );
} )();

/* -------------------------------------------------------------------------
 * Source invariants.
 * ---------------------------------------------------------------------- */

( function () {
	// escapeHtml goes through the DOM — textContent in, innerHTML out — which
	// escapes `<`, `>` and `&` and does NOT escape quotes. That is fine in
	// text position and an injection inside an attribute, so the one place it
	// is used has to stay a text position.
	const uses = source.match( /^.*escapeHtml\(.*$/gm ) || [];

	uses.forEach( ( line ) => {
		if ( /=\s*['"]/.test( line ) && ! /^\s*escapeHtml/.test( line ) ) {
			fail( `escapeHtml is used inside an attribute, where it escapes no quotes: ${ line.trim() }` );
		}
	} );

	if ( 1 !== ( source.match( /this\.escapeHtml\(/g ) || [] ).length ) {
		fail( 'escapeHtml has more call sites than the one this test checked' );
	}

	// The script must not format table cells. The server formats them with
	// the same code that renders the page; a second formatter here is how the
	// refresh came to print dollars on a site configured for euros and the
	// browser's date format on a site configured for another.
	[ 'formatCellValue', 'formatCurrency', 'formatNumber:', 'formatDateTime' ].forEach( ( name ) => {
		if ( source.includes( name ) ) {
			fail( `${ name } is back in the script; the server formats cells now` );
		}
	} );

	// And it must use the cells as given.
	if ( ! /\.html\(row\[columnKey\]/.test( source ) ) {
		fail( 'updateTable no longer writes the cell the server sent' );
	}

	// A row's icon is an element built attribute by attribute, never a
	// string of markup: its URL came from a callback this script knows
	// nothing about, and .attr() cannot be talked out of an attribute.
	const icon = ( source.match( /rowIcon: function \(row\) \{[\s\S]*?\n {8}\},/ ) || [ '' ] )[ 0 ];

	if ( ! /\$\('<img>'\)\.addClass\('reports-row-icon'\)\.attr\(\{/.test( icon ) || /\.html\(|\+ *row\.icon/.test( icon ) ) {
		fail( 'rowIcon no longer builds its image with .attr()' );
	}

	// And both lists that can carry one draw it: without the call, a flag
	// is on the page when it loads and gone after the first refresh.
	if ( 2 !== ( source.match( /this\.rowIcon\(row\)/g ) || [] ).length ) {
		fail( 'a breakdown row and a stat row should each draw their icon' );
	}

	// Row action URLs substitute from the unformatted row. An id rendered for
	// display is 1,204 and links to nothing.
	if ( ! /Object\.keys\(raw\)\.forEach/.test( source ) ) {
		fail( 'row action URLs are no longer built from the raw row' );
	}
} )();

/* -------------------------------------------------------------------------
 * The current section is scrolled into view in a row that overflows.
 *
 * The tab bar, and the sidebar on a phone, are one line that scrolls. Run
 * against a row and a link that are only their measurements, which is all
 * the function reads: the row is moved so the link sits in the middle of
 * it, and a row where everything fits is left alone.
 * ---------------------------------------------------------------------- */

( function () {
	/**
	 * Load the script with one current link in one row, and say where the
	 * row was scrolled to.
	 *
	 * @param {number} scrollWidth How wide the row's contents are.
	 *
	 * @return {number} The row's scrollLeft afterwards.
	 */
	function reveal( scrollWidth ) {
		const row = {
			scrollWidth,
			clientWidth: 390,
			scrollLeft: 0,
			getBoundingClientRect: () => ( { left: 0, width: 390 } ),
		};

		const link = {
			closest: ( selector ) => ( /reports-sidebar-scroll/.test( selector ) && /field-kit__page-tabs/.test( selector ) ? row : null ),
			getBoundingClientRect: () => ( { left: 800, width: 90 } ),
		};

		const nothing = makeJQuery();

		const $ = function ( thing ) {
			if ( 'string' === typeof thing && /reports-sidebar-link\[aria-current\]/.test( thing ) && /field-kit__page-tab\[aria-current\]/.test( thing ) ) {
				return { each: ( fn ) => fn.call( link ) };
			}

			return nothing( thing );
		};

		Object.assign( $, nothing );

		load( { jQuery: $ } );

		return row.scrollLeft;
	}

	// 800 from the row's edge, in a 390 row, 90 wide: centred is 800 - 150.
	is( reveal( 1289 ), 650, 'revealCurrentSection: an overflowing row centres the current link' );
	is( reveal( 390 ), 0, 'revealCurrentSection: a row that fits is not scrolled' );
} )();

/*
 * A dataset is styled by its own type, so bars and a line drawn together
 * each look like themselves.
 */
( function () {
	const line = controller.styleDataset( { type: 'line', borderColor: '#3858e9', data: [ 1 ] }, 'bar', 0 );

	is( typeof line.backgroundColor, 'function', 'styleDataset: a line in a bar chart gets the fade under it' );
	is( line.pointRadius, 0, 'styleDataset: a line in a bar chart has no dot on every point' );
	is( line.borderRadius, undefined, 'styleDataset: a line in a bar chart is not rounded like a bar' );

	const bar = controller.styleDataset( { data: [ 1 ] }, 'bar', 0 );

	is( typeof bar.backgroundColor, 'function', 'styleDataset: a bar with no colour fades down' );
	is( bar.borderRadius, 8, 'styleDataset: a bar is rounded' );
} )();

/*
 * A colour per bar is kept, and is what each bar turns under the pointer.
 */
( function () {
	const colours = [ '#ccd5fa', '#3858e9', '#ccd5fa' ];
	const bar = controller.styleDataset( { data: [ 1, 3, 2 ], backgroundColor: colours.slice() }, 'bar', 0 );

	is( JSON.stringify( bar.backgroundColor ), JSON.stringify( colours ), 'styleDataset: a colour per bar is kept' );
	is( JSON.stringify( bar.hoverBackgroundColor ), JSON.stringify( colours ), 'styleDataset: a coloured bar keeps its colour on hover' );
} )();

/*
 * A refresh draws what the new data says. The tallest bar picked out last
 * time is not the tallest this time, and a stale colour list painted the
 * old one.
 */
( function () {
	let updated = null;

	const chart = {
		data: { labels: [], datasets: [] },
		config: { type: 'bar' },
		canvas: {},
		update: function () {
			updated = this.data;
		},
	};

	controller.charts.best = chart;
	controller.chartConfigs.best = {
		type: 'bar',
		data: { datasets: [ { label: 'Sales', data: [ 3, 1 ], backgroundColor: [ '#111111', '#eeeeee' ], borderRadius: 2 } ] },
	};

	controller.updateChart( 'best', { labels: [ 'a', 'b' ], datasets: [ { label: 'Sales', data: [ 1, 3 ], backgroundColor: [ '#eeeeee', '#111111' ] } ] } );

	is( JSON.stringify( updated.datasets[ 0 ].backgroundColor ), JSON.stringify( [ '#eeeeee', '#111111' ] ), 'updateChart: the new colours win' );
	is( JSON.stringify( updated.datasets[ 0 ].hoverBackgroundColor ), JSON.stringify( [ '#eeeeee', '#111111' ] ), 'updateChart: hover follows the new colours' );
	is( updated.datasets[ 0 ].borderRadius, 2, 'updateChart: what the new data does not say is kept from the page' );
	is( JSON.stringify( updated.datasets[ 0 ].data ), '[1,3]', 'updateChart: the new values are drawn' );

	delete controller.charts.best;
	delete controller.chartConfigs.best;
} )();

/* -------------------------------------------------------------------------
 * Icons arrive drawn. A refreshed tile shows the arrow PHP drew into the
 * config, and a row that names an icon shows the SVG the server sent, so
 * the script holds no idea of its own of what an icon looks like.
 * ---------------------------------------------------------------------- */

( function () {
	const arrows = { up: '<svg class="sugarcommerce-icon">up</svg>', down: '<svg class="sugarcommerce-icon">down</svg>', neutral: '<svg class="sugarcommerce-icon">level</svg>' };
	const base = makeJQuery();
	const built = [];
	const $ = Object.assign( function ( thing ) {
		built.push( thing );

		return base( thing );
	}, base );

	const iconCtx = load( {
		jQuery: $,
		window: { SugarCommerceReports: { 'sugarcommerce-reports': { changeIcons: arrows } } },
		document: {
			currentScript: { id: 'sugarcommerce-reports-js' },
			addEventListener() {},
			createElement: () => ( {} ),
			createTextNode: ( text ) => ( { text } ),
			hidden: false,
		},
	} );

	const reports = iconCtx.window.ReportsController;

	/**
	 * A tile's change element that records what it is given.
	 *
	 * @return {Object} The tile, and what its change was set to.
	 */
	function tile() {
		const seen = { html: null, appended: null, added: null, emptied: false };
		const change = {
			empty() {
				seen.emptied = true;

				return change;
			},
			removeClass() {
				return change;
			},
			addClass( name ) {
				seen.added = name;

				return change;
			},
			html( markup ) {
				seen.html = markup;

				return change;
			},
			append( node ) {
				seen.appended = node;

				return change;
			},
		};

		return {
			seen,
			$tile: {
				find: ( selector ) => ( '.reports-tile-change' === selector ? change : { text() {} } ),
			},
		};
	}

	[ [ 'up', 'up' ], [ 'down', 'down' ], [ 'neutral', 'level' ], [ 'sideways', 'level' ] ].forEach( ( [ direction, drawn ] ) => {
		const t = tile();

		reports.updateTile( t.$tile, { change: -12.34, change_direction: direction } );

		is( t.seen.html, arrows[ 'level' === drawn ? 'neutral' : direction ], `updateTile: the ${ direction } arrow is the one from the config` );
		is( t.seen.added, 'change-' + ( 'level' === drawn ? 'neutral' : direction ), `updateTile: a ${ direction } change is classed for it` );
		is( t.seen.appended && t.seen.appended.text, ' 12.3%', `updateTile: the ${ direction } change reads as text after the arrow` );
	} );

	// Nothing to compare against is an empty chip, as the page drew it --
	// not "0.0%" -- and a chip that had a figure loses it.
	[ [ null, null ], [ null, 'neutral' ], [ 0, null ], [ 4.2, '' ] ].forEach( ( [ value, direction ] ) => {
		const t = tile();

		reports.updateTile( t.$tile, { change: value, change_direction: direction } );

		is( t.seen.emptied, true, `updateTile: change ${ value } going ${ direction } empties the chip` );
		is( t.seen.added, 'change-neutral', `updateTile: change ${ value } going ${ direction } is classed level` );
		is( t.seen.appended, null, `updateTile: change ${ value } going ${ direction } writes no figure` );
		is( t.seen.html, null, `updateTile: change ${ value } going ${ direction } draws no arrow` );
	} );

	{
		const t = tile();

		reports.updateTile( t.$tile, { change: 0, change_direction: 'neutral' } );

		is( t.seen.appended && t.seen.appended.text, ' 0.0%', 'updateTile: a level change the server worked out is still said' );
		is( t.seen.emptied, false, 'updateTile: a level change keeps its chip' );
	}

	is( /dashicons/.test( source ), false, 'no Dashicons are built by the script' );

	built.length = 0;
	reports.rowIcon( { icon: '', icon_html: '<svg class="sugarcommerce-icon reports-row-icon"></svg>' } );
	is( built[ 0 ], '<svg class="sugarcommerce-icon reports-row-icon"></svg>', 'rowIcon: a named icon is the markup the server drew' );

	built.length = 0;
	reports.rowIcon( { icon: 'https://example.test/jp.svg', icon_html: '' } );
	is( built[ 0 ], '<img>', 'rowIcon: a URL is still a picture' );

	is( reports.rowIcon( { icon: '', icon_html: '' } ), null, 'rowIcon: a row with neither has none' );

	{
		const seen = {};
		const $list = {
			find: ( selector ) => ( {
				empty() {
					return this;
				},
				prop( name, value ) {
					seen[ selector + ' ' + name ] = value;
					return this;
				},
			} ),
		};

		reports.updateStatList( $list, { rows: [] } );
		is( seen[ '.reports-empty hidden' ], false, 'updateStatList: a list a refresh emptied says so' );
	}
} )();

/* -------------------------------------------------------------------------
 * Requests go through wp.apiFetch.
 *
 * The page's nonce runs out after a day, and a report refreshes itself on a
 * timer: sent with $.ajax and the printed nonce, a screen left open overnight
 * got a 403 on every refresh. apiFetch fetches a fresh nonce and retries.
 * ---------------------------------------------------------------------- */

/**
 * A jQuery whose report wrapper names a report, so a refresh is sent.
 *
 * @param {Array} ajax Where $.ajax calls are recorded.
 * @return {Function} The stub.
 */
function reportJQuery( ajax ) {
	const collection = new Proxy( function () {}, {
		get( target, name ) {
			if ( 'length' === name ) {
				return 0;
			}

			if ( 'then' === name || Symbol.toPrimitive === name || 'constructor' === name ) {
				return undefined;
			}

			if ( 'data' === name ) {
				return () => 'sales';
			}

			if ( 'hasClass' === name ) {
				return () => false;
			}

			return () => collection;
		},
	} );

	const $ = () => collection;

	$.ajax = ( options ) => ajax.push( options );
	$.each = ( items, each ) => {
		Object.keys( items || {} ).forEach( ( key ) => each( key, items[ key ] ) );
	};
	$.extend = Object.assign;
	$.param = ( data ) => new URLSearchParams( data ).toString();

	return $;
}

/**
 * Run one refresh against an apiFetch that answers as told.
 *
 * @param {Function|null} answer Given the request, returns apiFetch's promise; null for a page without apiFetch.
 * @return {Promise<Object>} What was sent and what came of it.
 */
function refreshWith( answer ) {
	const seen = { apiFetch: [], ajax: [], updated: null, logged: null, completed: false };
	const context = load( {
		jQuery: reportJQuery( seen.ajax ),
		console: Object.assign( Object.create( console ), { log() {}, warn() {}, error: ( ...args ) => {
			seen.logged = args;
		} } ),
		window: {
			location: { href: 'https://example.test/wp-admin/admin.php?page=reports&tab=overview' },
			SugarCommerceReports: { 'sugarcommerce-reports': { restUrl: 'https://example.test/wp-json/reports/v1/', restNonce: 'stale' } },
			wp: answer ? {
				apiFetch: ( options ) => {
					seen.apiFetch.push( options );

					return answer( options );
				},
			} : {},
		},
	} );
	const reports = context.window.ReportsController;

	reports.updateComponents = ( components ) => {
		seen.updated = components;
	};
	reports.updateLastUpdatedText = () => {
		seen.completed = true;
	};

	reports.refreshAllComponents();

	return new Promise( ( resolve ) => setImmediate( () => setImmediate( () => resolve( seen ) ) ) );
}

const requestChecks = ( async function () {
	const ok = await refreshWith( () => Promise.resolve( { success: true, components: { total: 1 } } ) );

	is( ok.ajax.length, 0, 'refresh: $.ajax is not used when apiFetch is there' );
	is( ok.apiFetch.length, 1, 'refresh: sent through apiFetch' );

	if ( ok.apiFetch[ 0 ] ) {
		is( ok.apiFetch[ 0 ].method, 'GET', 'refresh: a GET' );
		is( /\/components\?report_id=sales&tab=overview/.test( ok.apiFetch[ 0 ].url ), true, 'refresh: the query is on the URL' );
		is( ok.apiFetch[ 0 ].parse, true, 'refresh: apiFetch parses, so it can see a stale nonce' );
	}

	is( ok.updated && ok.updated.total, 1, 'refresh: the components are updated from the answer' );
	is( ok.completed, true, 'refresh: complete runs after success' );

	const refused = await refreshWith( () => Promise.reject( { code: 'rest_forbidden', message: 'No.', data: { status: 403 } } ) );

	is( refused.updated, null, 'refresh: a refusal updates nothing' );
	is( refused.logged && refused.logged[ 1 ] && refused.logged[ 1 ].message, 'No.', 'refresh: a refusal reaches error() as responseJSON' );
	is( refused.completed, true, 'refresh: complete runs after an error' );

	const bare = await refreshWith( null );

	is( bare.ajax.length, 1, 'refresh: without apiFetch it falls back to $.ajax' );
} )();

requestChecks.then( () => {
	if ( failures ) {
		console.error( `\n${ failures } failure(s)` );
		process.exit( 1 );
	}

	console.log( '  controller loads, init survives an empty page, URL reading and escaping hold, requests go through apiFetch' );
} );
