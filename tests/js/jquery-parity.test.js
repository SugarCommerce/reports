/**
 * The helpers that stand in for jQuery do what jQuery 3.7 did, checked
 * against jQuery itself: what the refresh's GET carries, how a chart's own
 * options are laid over the report's look, how the page's data attributes
 * read, and how show(), hide() and toggle() leave an element.
 */

import jQuery from 'jquery';
import { afterEach, describe, expect, test } from 'vitest';

import { data, parseData, setData } from '../../assets/js/lib/data';
import { hide, show, toggle } from '../../assets/js/lib/dom';
import { merge } from '../../assets/js/lib/merge';
import { param } from '../../assets/js/lib/query';

afterEach( () => {
	document.head.innerHTML = '';
	document.body.innerHTML = '';
} );

describe( 'param() writes what $.param() wrote', () => {
	const cases = {
		'the refresh request': {
			report_id: 'sales',
			tab: '',
			date_preset: 'last_30',
			date_start: '',
			date_end: '',
			filter_status: [ 'complete', 'refunded' ],
			filter_country: 'GB',
		},
		'a filter already bracketed': {
			'filter_status[0]': 'complete',
			'filter_status[]': [ 'a', 'b' ],
		},
		'nested objects and lists of objects': {
			a: { b: { c: 1 }, d: [ 1, 2 ] },
			list: [ { x: 1 }, [ 2, 3 ], null ],
		},
		'odd values': {
			nothing: null,
			undef: undefined,
			zero: 0,
			no: false,
			yes: true,
			fn: () => 'called',
			date: new Date( 0 ),
			space: 'a b+c&d=e/é',
			empty: [],
			emptyObject: {},
		},
		'a number as a report id': { report_id: 1204 },
	};

	Object.entries( cases ).forEach( ( [ name, value ] ) => {
		test( name, () => {
			expect( param( value ) ).toBe( jQuery.param( value ) );
		} );
	} );

	test( 'nothing is an empty string', () => {
		expect( param( null ) ).toBe( '' );
		expect( param( undefined ) ).toBe( '' );
		expect( param( {} ) ).toBe( '' );
	} );
} );

describe( 'merge() merges as $.extend( true ) did', () => {
	const base = () => ( {
		responsive: true,
		plugins: {
			legend: { display: false, labels: { color: '#5c5f66' } },
			tooltip: { padding: 12 },
		},
		scales: { y: { ticks: { maxTicksLimit: 6 } } },
		list: [ 1, 2, 3 ],
	} );

	const overrides = {
		'a key deep down': { plugins: { legend: { display: true } } },
		'a list over a list': { list: [ 9 ] },
		'a list where there was none': { scales: { y: { stack: [ 'a' ] } } },
		'a list over an object': { plugins: { legend: [ 'x' ] } },
		'an object over a value': { responsive: { not: 'a bool' } },
		'a value over an object': { plugins: 'off' },
		'undefined changes nothing': { responsive: undefined },
		'null is kept': { scales: null },
		'__proto__ is ignored': JSON.parse(
			'{"__proto__": {"polluted": true}, "ok": 1}'
		),
	};

	Object.entries( overrides ).forEach( ( [ name, override ] ) => {
		test( name, () => {
			expect( merge( base(), override ) ).toEqual(
				jQuery.extend( true, base(), override )
			);
		} );
	} );

	test( 'the source is copied, not shared', () => {
		const override = { plugins: { title: { text: 'Hi' } }, list: [ 4 ] };
		const merged = merge( {}, override );

		expect( merged.plugins ).not.toBe( override.plugins );
		expect( merged.list ).not.toBe( override.list );
		expect( merged ).toEqual( override );
		expect( {}.polluted ).toBeUndefined();
	} );
} );

describe( 'data() reads as .data() did', () => {
	const values = [
		'true',
		'false',
		'null',
		'5',
		'1.5',
		'-3',
		'1.0',
		'007',
		'1e3',
		' 5',
		'{"type":"line","data":{"labels":[]}}',
		'[1,2]',
		'{broken',
		'{not json}',
		'sales',
		'',
	];

	values.forEach( ( text ) => {
		test( `data-chart-config=${ JSON.stringify( text ) }`, () => {
			const ours = document.createElement( 'div' );
			const theirs = document.createElement( 'div' );

			ours.setAttribute( 'data-chart-config', text );
			theirs.setAttribute( 'data-chart-config', text );

			expect( data( ours, 'chart-config' ) ).toEqual(
				jQuery( theirs ).data( 'chart-config' )
			);
			expect( parseData( text ) ).toEqual(
				jQuery( theirs ).data( 'chartConfig' )
			);
		} );
	} );

	test( 'a value is read once and kept, and what is set wins', () => {
		const ours = document.createElement( 'div' );
		const theirs = document.createElement( 'div' );

		[ ours, theirs ].forEach( ( el ) =>
			el.setAttribute( 'data-current-page', '2' )
		);

		expect( data( ours, 'current-page' ) ).toBe(
			jQuery( theirs ).data( 'current-page' )
		);

		[ ours, theirs ].forEach( ( el ) =>
			el.setAttribute( 'data-current-page', '7' )
		);

		expect( data( ours, 'current-page' ) ).toBe(
			jQuery( theirs ).data( 'current-page' )
		);
		expect( data( ours, 'current-page' ) ).toBe( 2 );

		setData( ours, 'current-page', 4 );
		jQuery( theirs ).data( 'current-page', 4 );

		expect( data( ours, 'currentPage' ) ).toBe(
			jQuery( theirs ).data( 'currentPage' )
		);
		expect( ours.getAttribute( 'data-current-page' ) ).toBe( '7' );
	} );

	test( 'a missing attribute or element is undefined', () => {
		const div = document.createElement( 'div' );

		expect( data( div, 'nothing' ) ).toBe(
			jQuery( div ).data( 'nothing' )
		);
		expect( data( null, 'nothing' ) ).toBeUndefined();
	} );
} );

describe( 'show(), hide() and toggle() leave an element as jQuery did', () => {
	const style = `
		.hidden-by-sheet { display: none; }
		.flexy { display: flex; }
	`;

	/**
	 * Two copies of some markup, one for each side.
	 *
	 * @param {string} markup The markup.
	 * @return {Element[]} Ours and theirs.
	 */
	const twins = ( markup ) => {
		document.head.innerHTML = `<style>${ style }</style>`;
		document.body.innerHTML = `<div id="ours">${ markup }</div><div id="theirs">${ markup }</div>`;

		return [
			document.querySelector( '#ours' ).firstElementChild,
			document.querySelector( '#theirs' ).firstElementChild,
		];
	};

	const sequences = {
		'a row hidden then shown': [ 'hide', 'show' ],
		'shown twice': [ 'show', 'show' ],
		'hidden twice, shown': [ 'hide', 'hide', 'show' ],
		'toggled thrice': [ 'toggle', 'toggle', 'toggle' ],
		'toggled to a state': [ 'toggle:false', 'toggle:true', 'toggle:true' ],
	};

	const markups = {
		'an inline none': '<div style="display: none;">x</div>',
		'nothing set': '<div>x</div>',
		'a table row': '<table><tbody><tr><td>x</td></tr></tbody></table>',
		'hidden by the stylesheet': '<div class="hidden-by-sheet">x</div>',
		'a span hidden by the stylesheet':
			'<span class="hidden-by-sheet">x</span>',
		'an inline flex': '<div style="display: flex;">x</div>',
		'a stylesheet flex': '<div class="flexy">x</div>',
	};

	Object.entries( markups ).forEach( ( [ markupName, markup ] ) => {
		Object.entries( sequences ).forEach( ( [ name, steps ] ) => {
			test( `${ markupName }: ${ name }`, () => {
				let [ ours, theirs ] = twins( markup );

				if ( ours.tagName === 'TABLE' ) {
					ours = ours.querySelector( 'tr' );
					theirs = theirs.querySelector( 'tr' );
				}

				steps.forEach( ( step ) => {
					const [ verb, state ] = step.split( ':' );
					const argument =
						state === undefined ? undefined : state === 'true';

					( { hide, show, toggle } )[ verb ]( ours, argument );
					jQuery( theirs )[ verb ]( argument );

					expect( ours.getAttribute( 'style' ) ).toBe(
						theirs.getAttribute( 'style' )
					);
				} );
			} );
		} );
	} );

	test( 'nothing to show or hide is nothing', () => {
		expect( () => {
			show( null );
			hide( null );
			toggle( null );
		} ).not.toThrow();
	} );
} );
