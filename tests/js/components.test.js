/**
 * Components drawn again from a refresh.
 *
 * Icons arrive drawn: a refreshed tile shows the arrow PHP drew into the
 * settings, and a row that names an icon shows the SVG the server sent, so
 * the script holds no idea of its own of what an icon looks like.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	rowIcon,
	updateBreakdown,
	updateComponents,
	updateProgress,
	updateStatList,
	updateTile,
} from '../../src/js/reports/components';
import { ARROWS } from './support/page';

afterEach( () => {
	document.body.innerHTML = '';
} );

/**
 * A tile as TileRenderer draws one.
 *
 * @return {Element} The tile.
 */
function tile() {
	document.body.innerHTML = `<div class="reports-tile" data-component-id="t"><div class="reports-tile-value">$1</div><div class="reports-tile-change change-down">${ ARROWS.down } 7.2%</div></div>`;

	return document.querySelector( '.reports-tile' );
}

const change = () => document.querySelector( '.reports-tile-change' );

describe( 'a tile', () => {
	test( 'its figure, formatted when the server formatted it', () => {
		const element = tile();

		updateTile( element, { value: 5, formatted_value: '$5.00' }, ARROWS );
		expect(
			element.querySelector( '.reports-tile-value' ).textContent
		).toBe( '$5.00' );

		updateTile( element, { value: 7 }, ARROWS );
		expect(
			element.querySelector( '.reports-tile-value' ).textContent
		).toBe( '7' );

		updateTile( element, {}, ARROWS );
		expect(
			element.querySelector( '.reports-tile-value' ).textContent
		).toBe( '7' );
		expect( change().textContent ).toContain( '7.2%' );
	} );

	[
		[ 'up', 'up' ],
		[ 'down', 'down' ],
		[ 'neutral', 'neutral' ],
		[ 'sideways', 'neutral' ],
	].forEach( ( [ direction, drawn ] ) => {
		test( `a change going ${ direction }: the config's arrow, then the figure`, () => {
			updateTile(
				tile(),
				{ change: -12.34, change_direction: direction },
				ARROWS
			);

			expect( change().className ).toBe(
				'reports-tile-change change-' + drawn
			);
			expect( change().innerHTML ).toBe( ARROWS[ drawn ] + ' 12.3%' );
		} );
	} );

	// Nothing to compare against is an empty chip, as the page drew it --
	// not "0.0%" -- and a chip that had a figure loses it.
	[
		[ null, null ],
		[ null, 'neutral' ],
		[ 0, null ],
		[ 4.2, '' ],
	].forEach( ( [ value, direction ] ) => {
		test( `a change of ${ value } going ${ direction }: an empty level chip`, () => {
			updateTile(
				tile(),
				{ change: value, change_direction: direction },
				ARROWS
			);

			expect( change().className ).toBe(
				'reports-tile-change change-neutral'
			);
			expect( change().innerHTML ).toBe( '' );
		} );
	} );

	test( 'a level change the server worked out is still said', () => {
		updateTile(
			tile(),
			{ change: 0, change_direction: 'neutral' },
			ARROWS
		);

		expect( change().innerHTML ).toBe( ARROWS.neutral + ' 0.0%' );
	} );

	test( 'no arrows handed over: the figure alone', () => {
		updateTile(
			tile(),
			{ change: '3', change_direction: 'up' },
			undefined
		);

		expect( change().innerHTML ).toBe( ' 3.0%' );
	} );
} );

describe( "a row's icon", () => {
	test( 'a named icon is the markup the server drew', () => {
		const [ svg ] = rowIcon( {
			icon: 'https://example.test/ignored.svg',
			icon_html:
				'  <svg class="sugarcommerce-icon reports-row-icon"></svg> ',
		} );

		expect( svg.outerHTML ).toBe(
			'<svg class="sugarcommerce-icon reports-row-icon"></svg>'
		);
	} );

	test( 'a URL is a picture, built attribute by attribute', () => {
		const [ image ] = rowIcon( {
			icon: 'https://example.test/jp.svg" onerror="alert(1)',
			icon_html: '',
		} );

		expect( image.outerHTML ).toBe(
			'<img class="reports-row-icon" src="https://example.test/jp.svg&quot; onerror=&quot;alert(1)" width="16" height="16" alt="" loading="lazy" decoding="async">'
		);
		expect( image.hasAttribute( 'onerror' ) ).toBe( false );
	} );

	test( 'neither is nothing', () => {
		expect( rowIcon( { icon: '', icon_html: '' } ) ).toEqual( [] );
		expect( rowIcon( {} ) ).toEqual( [] );
	} );
} );

describe( 'a breakdown', () => {
	test( 'its rows, each with its icon, link, bar, share and figure', () => {
		document.body.innerHTML =
			'<div id="c"><ul class="reports-breakdown"><li>old</li></ul><p class="reports-breakdown-empty">None.</p></div>';

		updateBreakdown( document.querySelector( '#c' ), {
			rows: [
				{
					label: 'Japan',
					icon: 'https://example.test/jp.svg',
					url: '/jp?a=1&b=2',
					width: 75.5,
					share: '13.6%',
					formatted_value: '$140.64',
				},
				{ label: '<b>Plain</b>' },
			],
		} );

		const rows = document.querySelectorAll( '.reports-breakdown-row' );

		expect( rows ).toHaveLength( 2 );
		expect( rows[ 0 ].outerHTML ).toBe(
			'<li class="reports-breakdown-row"><span class="reports-breakdown-label"><img class="reports-row-icon" src="https://example.test/jp.svg" width="16" height="16" alt="" loading="lazy" decoding="async"><a href="/jp?a=1&amp;b=2">Japan</a></span><span class="reports-breakdown-track"><span class="reports-breakdown-fill" style="width: 75.5%;"></span></span><span class="reports-breakdown-share">13.6%</span><span class="reports-breakdown-value">$140.64</span></li>'
		);
		expect( rows[ 1 ].outerHTML ).toBe(
			'<li class="reports-breakdown-row"><span class="reports-breakdown-label">&lt;b&gt;Plain&lt;/b&gt;</span><span class="reports-breakdown-track"><span class="reports-breakdown-fill" style="width: 0%;"></span></span><span class="reports-breakdown-share"></span><span class="reports-breakdown-value"></span></li>'
		);
		expect(
			document.querySelector( '.reports-breakdown-empty' ).hidden
		).toBe( true );
	} );

	test( 'emptied by a refresh, it says so', () => {
		document.body.innerHTML =
			'<div id="c"><ul class="reports-breakdown"><li>old</li></ul><p class="reports-breakdown-empty" hidden>None.</p></div>';

		updateBreakdown( document.querySelector( '#c' ), { rows: 'nope' } );

		expect(
			document.querySelector( '.reports-breakdown' ).children
		).toHaveLength( 0 );
		expect(
			document.querySelector( '.reports-breakdown-empty' ).hidden
		).toBe( false );
	} );
} );

describe( 'a stat list', () => {
	test( 'its rows: a label, and the icon before the figure', () => {
		document.body.innerHTML =
			'<div id="c"><dl class="reports-stat-list"></dl><p class="reports-empty">None.</p></div>';

		updateStatList( document.querySelector( '#c' ), {
			rows: [
				{
					label: 'Keys',
					icon_html: '<svg class="i"></svg>',
					formatted_value: '$263.67',
				},
				{ label: 'Drums' },
			],
		} );

		expect( document.querySelector( '.reports-stat-list' ).innerHTML ).toBe(
			'<div class="reports-stat-row"><dt>Keys</dt><dd><svg class="i"></svg>$263.67</dd></div><div class="reports-stat-row"><dt>Drums</dt><dd></dd></div>'
		);
		expect( document.querySelector( '.reports-empty' ).hidden ).toBe(
			true
		);
	} );

	test( 'emptied by a refresh, it says so', () => {
		document.body.innerHTML =
			'<div id="c"><dl class="reports-stat-list"><div>old</div></dl><p class="reports-empty" hidden>None.</p></div>';

		updateStatList( document.querySelector( '#c' ), { rows: [] } );

		expect( document.querySelector( '.reports-stat-list' ).innerHTML ).toBe(
			''
		);
		expect( document.querySelector( '.reports-empty' ).hidden ).toBe(
			false
		);
	} );
} );

describe( 'a progress bar', () => {
	const bar = () => {
		document.body.innerHTML =
			'<div id="c"><div class="reports-progress-track" aria-valuenow="1"><div class="reports-progress-fill"></div></div><span class="reports-progress-percent"></span><span class="reports-progress-figures"></span></div>';

		return document.querySelector( '#c' );
	};

	test( 'the server’s figures, the bar kept between 0 and 100', () => {
		[
			[ '45.4516', '45.4516%', '45' ],
			[ 140, '100%', '100' ],
			[ -3, '0%', '0' ],
			[ 'x', '0%', '0' ],
		].forEach( ( [ percent, width, now ] ) => {
			const element = bar();

			updateProgress( element, {
				percent,
				formatted_percent: '45%',
				formatted_figures: '$1 of $2',
			} );

			expect(
				element.querySelector( '.reports-progress-fill' ).style.width
			).toBe( width );
			expect(
				element
					.querySelector( '.reports-progress-track' )
					.getAttribute( 'aria-valuenow' )
			).toBe( now );
		} );

		expect(
			document.querySelector( '.reports-progress-percent' ).textContent
		).toBe( '45%' );
		expect(
			document.querySelector( '.reports-progress-figures' ).textContent
		).toBe( '$1 of $2' );

		updateProgress( bar(), { percent: 1 } );
		expect(
			document.querySelector( '.reports-progress-percent' ).textContent
		).toBe( '' );
	} );
} );

describe( 'every component a refresh sent', () => {
	test( 'each drawn by its type, or by what it is on the page', () => {
		document.body.innerHTML = `
			<div class="reports-tile" data-component-id="tile"><div class="reports-tile-value">old</div></div>
			<div class="reports-chart-wrapper" data-component-id="chart"></div>
			<div class="reports-table-wrapper" data-component-id="table"></div>
			<div data-component-id="bar"><div class="reports-progress-fill"></div></div>
			<div data-component-id="list"><ul class="reports-breakdown"></ul></div>
			<div data-component-id="stats"><dl class="reports-stat-list"></dl></div>
			<div data-component-id="html">untouched</div>`;

		const chart = vi.fn();
		const table = vi.fn();

		updateComponents(
			document,
			{
				tile: { value: 1, formatted_value: 'one' },
				chart: { labels: [] },
				table: { rows: [] },
				bar: { type: 'progress', percent: 50 },
				list: { type: 'breakdown', rows: [ { label: 'A' } ] },
				stats: { type: 'stat_list', rows: [ { label: 'B' } ] },
				html: { type: 'html', content: 'changed' },
				missing: { type: 'tile', value: 2 },
			},
			{ icons: ARROWS, chart, table }
		);

		expect(
			document.querySelector( '.reports-tile-value' ).textContent
		).toBe( 'one' );
		expect( chart ).toHaveBeenCalledWith( 'chart', { labels: [] } );
		expect( table ).toHaveBeenCalledWith(
			document.querySelector( '[data-component-id="table"]' ),
			'table',
			{ rows: [] }
		);
		expect(
			document.querySelector(
				'[data-component-id="bar"] .reports-progress-fill'
			).style.width
		).toBe( '50%' );
		expect(
			document.querySelector( '.reports-breakdown' ).textContent
		).toBe( 'A' );
		expect(
			document.querySelector( '.reports-stat-list' ).textContent
		).toBe( 'B' );
		expect(
			document.querySelector( '[data-component-id="html"]' ).textContent
		).toBe( 'untouched' );
	} );

	test( 'a type the server names wins over the element', () => {
		document.body.innerHTML =
			'<div class="reports-chart-wrapper" data-component-id="x"><div class="reports-tile-value">old</div></div>';

		const chart = vi.fn();

		updateComponents(
			document,
			{ x: { type: 'tile', value: 3 } },
			{ icons: ARROWS, chart, table: vi.fn() }
		);

		expect( chart ).not.toHaveBeenCalled();
		expect(
			document.querySelector( '.reports-tile-value' ).textContent
		).toBe( '3' );
	} );

	test( 'an id with a quote in it is looked for, not a broken selector', () => {
		document.body.innerHTML =
			'<div class="reports-tile" data-component-id=\'a"b\'><div class="reports-tile-value">old</div></div>';

		updateComponents(
			document,
			{ 'a"b': { value: 'new' } },
			{ icons: ARROWS, chart: vi.fn(), table: vi.fn() }
		);

		expect(
			document.querySelector( '.reports-tile-value' ).textContent
		).toBe( 'new' );
	} );

	test( 'nothing sent is nothing drawn', () => {
		expect( () =>
			updateComponents( document, [], {
				icons: ARROWS,
				chart: vi.fn(),
				table: vi.fn(),
			} )
		).not.toThrow();
	} );
} );
