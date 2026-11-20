/**
 * Tables: their pages, sorting by a heading, and their rows drawn again
 * from a refresh -- the cells as the server sent them, row actions built
 * from the unformatted row.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { data, setData } from '../../src/js/lib/data';
import { translator } from '../../src/js/lib/text';
import {
	applyPagination,
	pageWindow,
} from '../../src/js/reports/tables/paging';
import {
	escapeJs,
	readTableConfig,
	readTableConfigs,
	updateTable,
} from '../../src/js/reports/tables/rows';
import { compareCells } from '../../src/js/reports/tables/sort';
import {
	cleanup,
	click,
	layout,
	reportPage,
	startReport,
	STRINGS,
} from './support/page';

const t = translator( STRINGS );

beforeEach( layout );
afterEach( cleanup );

const shownRows = () =>
	[ ...document.querySelectorAll( '.reports-table tbody tr' ) ].map(
		( row ) => row.style.display !== 'none'
	);
const info = () => document.querySelector( '.reports-table-info' ).textContent;
const buttons = () =>
	[ ...document.querySelectorAll( '.reports-table-pages > *' ) ].map(
		( el ) =>
			el.textContent +
			( el.disabled ? '!' : '' ) +
			( el.classList.contains( 'button-primary' ) ? '*' : '' )
	);
const press = ( label ) =>
	click(
		[ ...document.querySelectorAll( '.reports-table-pages button' ) ].find(
			( b ) => b.textContent === label
		)
	);

describe( 'escapeJs, which writes into a string inside an onclick', () => {
	test( 'quotes and backslashes, as esc_js() does', () => {
		expect( escapeJs( "it's" ) ).toBe( "it\\'s" );
		expect( escapeJs( 'say "hi"' ) ).toBe( 'say \\"hi\\"' );
		expect( escapeJs( 'a\\b' ) ).toBe( 'a\\\\b' );
	} );

	test( 'a trailing backslash does not escape the closing quote', () => {
		const inside = "return confirm('" + escapeJs( 'x\\' ) + "')";

		expect( inside.endsWith( "\\\\')" ) ).toBe( true );
	} );

	test( 'not a string: handed back untouched', () => {
		expect( escapeJs( 42 ) ).toBe( 42 );
	} );
} );

describe( 'pages', () => {
	test( 'the window of five numbers around the page', () => {
		expect( pageWindow( 1, 3 ) ).toEqual( { first: 1, last: 3 } );
		expect( pageWindow( 1, 10 ) ).toEqual( { first: 1, last: 5 } );
		expect( pageWindow( 5, 10 ) ).toEqual( { first: 3, last: 7 } );
		expect( pageWindow( 10, 10 ) ).toEqual( { first: 6, last: 10 } );
		expect( pageWindow( 9, 10 ) ).toEqual( { first: 6, last: 10 } );
	} );

	test( 'a paged table opens on page one', () => {
		startReport( { rows: 12, perPage: 5 } );

		expect( shownRows() ).toEqual(
			Array.from( { length: 12 }, ( u, i ) => i < 5 )
		);
		expect( info() ).toBe( 'Showing 1-5 of 12' );
		expect( buttons() ).toEqual( [ 'Previous!', '1!*', '2', '3', 'Next' ] );
	} );

	test( 'the buttons turn the page', () => {
		startReport( { rows: 12, perPage: 5 } );

		press( '3' );
		expect( info() ).toBe( 'Showing 11-12 of 12' );
		expect( shownRows().filter( Boolean ) ).toHaveLength( 2 );
		expect( buttons() ).toEqual( [ 'Previous', '1', '2', '3!*', 'Next!' ] );

		press( 'Previous' );
		expect( info() ).toBe( 'Showing 6-10 of 12' );

		press( 'Next' );
		expect( info() ).toBe( 'Showing 11-12 of 12' );

		// A disabled button does nothing.
		const next = [
			...document.querySelectorAll( '.reports-table-pages button' ),
		].find( ( b ) => b.textContent === 'Next' );

		next.disabled = false;
		setData( next, 'page', 1 );
		next.disabled = true;
		click( next );
		expect( info() ).toBe( 'Showing 11-12 of 12' );
	} );

	test( 'many pages: the first and last either side of an ellipsis', () => {
		startReport( { rows: 50, perPage: 5 } );

		press( 'Next' );
		press( '3' );
		press( '4' );
		press( '5' );

		expect( buttons() ).toEqual( [
			'Previous',
			'1',
			'…',
			'3',
			'4',
			'5!*',
			'6',
			'7',
			'…',
			'10',
			'Next',
		] );

		// From page two, no gap between 1 and 2 to mark.
		press( '1' );
		press( '4' );
		expect( buttons() ).toEqual( [
			'Previous',
			'1',
			'2',
			'3',
			'4!*',
			'5',
			'6',
			'…',
			'10',
			'Next',
		] );

		press( '10' );
		expect( buttons() ).toEqual( [
			'Previous',
			'1',
			'…',
			'6',
			'7',
			'8',
			'9',
			'10!*',
			'Next!',
		] );
		expect( info() ).toBe( 'Showing 46-50 of 50' );
	} );

	test( 'one page: no buttons, the bar hidden', () => {
		startReport( { rows: 3, perPage: 5 } );

		expect( shownRows() ).toEqual( [ true, true, true ] );
		expect(
			document.querySelector( '.reports-table-pagination' )
		).toBeNull();
	} );

	test( 'a bar the page drew is hidden when one page is enough', () => {
		document.body.innerHTML = `
			<div class="reports-table-container" data-paginated="true" data-per-page="10">
				<table class="reports-table"><tbody><tr><td>1</td></tr></tbody></table>
				<div class="reports-table-pagination"><span class="reports-table-info"></span><div class="reports-table-pages"><button>old</button></div></div>
			</div>`;

		applyPagination(
			document.querySelector( '.reports-table-container' ),
			t
		);

		expect( info() ).toBe( 'Showing 1-1 of 1' );
		expect(
			document.querySelector( '.reports-table-pages' ).children
		).toHaveLength( 0 );
		expect(
			document.querySelector( '.reports-table-pagination' ).style.display
		).toBe( 'none' );
	} );

	test( 'a table with no bar gets one when it needs it', () => {
		document.body.innerHTML = `
			<div class="reports-table-container" data-per-page="2">
				<table class="reports-table"><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>
			</div>`;

		applyPagination(
			document.querySelector( '.reports-table-container' ),
			t
		);

		expect(
			document.querySelector(
				'.reports-table-container > .reports-table-pagination > .reports-table-info + .reports-table-pages'
			)
		).not.toBeNull();
		expect( info() ).toBe( 'Showing 1-2 of 3' );
	} );

	test( 'ten to a page when the page does not say', () => {
		document.body.innerHTML = `<div class="reports-table-container"><table class="reports-table"><tbody>${ '<tr><td>x</td></tr>'.repeat(
			11
		) }</tbody></table></div>`;

		applyPagination(
			document.querySelector( '.reports-table-container' ),
			t
		);

		expect( info() ).toBe( 'Showing 1-10 of 11' );
	} );
} );

describe( 'sorting', () => {
	test( 'numbers as numbers, text as text, either way', () => {
		expect( compareCells( '$1,204.50', '$99', false ) ).toBeGreaterThan(
			0
		);
		expect( compareCells( '$1,204.50', '$99', true ) ).toBeLessThan( 0 );
		expect( compareCells( 'apple', 'banana', false ) ).toBeLessThan( 0 );
		expect( compareCells( 'apple', 'banana', true ) ).toBeGreaterThan( 0 );
		expect( compareCells( '5', 'n/a', false ) ).toBe(
			'5'.localeCompare( 'n/a' )
		);
	} );

	test( 'a heading sorts ascending, then descending', () => {
		document.body.innerHTML = reportPage( { rows: 4, perPage: 10 } );
		document
			.querySelectorAll( 'td[data-column="total"]' )
			.forEach( ( cell, i ) => {
				cell.textContent = [ '$10.00', '$2.00', '$1,000.00', '$3.50' ][
					i
				];
			} );
		startReport( { html: document.body.innerHTML } );

		const totals = () =>
			[ ...document.querySelectorAll( 'td[data-column="total"]' ) ].map(
				( c ) => c.textContent
			);
		const heading = document.querySelector( 'th[data-column="total"]' );

		click( heading );
		expect( totals() ).toEqual( [
			'$2.00',
			'$3.50',
			'$10.00',
			'$1,000.00',
		] );
		expect( heading.className ).toBe( 'sortable sorted-asc' );

		click( heading );
		expect( totals() ).toEqual( [
			'$1,000.00',
			'$10.00',
			'$3.50',
			'$2.00',
		] );
		expect( heading.className ).toBe( 'sortable sorted-desc' );

		// Another heading clears this one's mark.
		click( document.querySelector( 'th[data-column="customer"]' ) );
		expect( heading.className ).toBe( 'sortable' );
	} );

	test( 'a heading that is not sortable does nothing', () => {
		startReport( { rows: 3 } );

		const heading = document.querySelector( 'th[data-column="total"]' );

		heading.classList.remove( 'sortable' );
		click( heading );

		expect( heading.className ).toBe( '' );
	} );
} );

describe( 'configuration', () => {
	test( 'from data-table-config when PHP wrote it', () => {
		startReport();

		const configs = readTableConfigs( document, t );

		expect( configs.orders_table.perPage ).toBe( 5 );
		expect( configs.orders_table.columns.map( ( c ) => c.key ) ).toEqual( [
			'number',
			'customer',
			'total',
		] );
	} );

	test( 'from the headings and the first row when it did not', () => {
		document.body.innerHTML = `
			<div class="reports-table-wrapper" data-component-id="t">
				<div class="reports-table-container" data-paginated="true" data-per-page="25">
					<table class="reports-table">
						<thead><tr><th class="sortable" data-column="id"> ID </th><th data-column="name">Name</th><th>No key</th><th class="reports-table-actions-col" data-column="x">Actions</th></tr></thead>
						<tbody><tr><td>1</td><td>A</td><td class="reports-table-actions"><div class="reports-row-actions-wrap">
							<a href="/edit/{id}" class="reports-row-action reports-row-action-edit extra" target="_blank">Edit</a> <span class="sep">|</span>
							<a href="/delete/{id}" class="reports-row-action reports-row-action-delete" onclick="return confirm('Sure?')">Delete</a>
							<a href="#" class="reports-row-action reports-row-action-row">Row</a>
						</div></td></tr></tbody>
					</table>
				</div>
			</div>`;

		expect(
			readTableConfig(
				document.querySelector( '.reports-table-wrapper' ),
				t
			)
		).toEqual( {
			columns: [
				{ key: 'id', label: 'ID', sortable: true, format: '' },
				{ key: 'name', label: 'Name', sortable: false, format: '' },
			],
			rowActions: [
				{
					key: 'edit',
					label: 'Edit',
					url: '/edit/{id}',
					class: 'extra',
					confirm: '',
					target: '_blank',
				},
				{
					key: 'delete',
					label: 'Delete',
					url: '/delete/{id}',
					class: '',
					confirm: 'Sure?',
					target: '',
				},
			],
			emptyMessage: STRINGS.noData,
			paginated: true,
			perPage: 25,
		} );
	} );

	test( 'an empty table: its message, not paged', () => {
		document.body.innerHTML = `
			<div class="reports-table-wrapper" data-component-id="t">
				<div class="reports-table-container" data-paginated="false" data-per-page="x">
					<div class="reports-table-empty"><p>Nothing sold.</p></div>
				</div>
			</div>`;

		expect( readTableConfigs( document, t ).t ).toEqual( {
			columns: [],
			rowActions: [],
			emptyMessage: 'Nothing sold.',
			paginated: false,
			perPage: 10,
		} );
	} );

	test( 'a wrapper with no id is not kept', () => {
		document.body.innerHTML =
			'<div class="reports-table-wrapper"><table class="reports-table"></table></div>';

		expect( readTableConfigs( document, t ) ).toEqual( {} );
	} );
} );

describe( 'rows drawn again', () => {
	const wrapper = () => document.querySelector( '.reports-table-wrapper' );

	test( 'the cells as the server sent them, in the columns’ order', () => {
		startReport( { rows: 2, perPage: 5 } );

		const config = readTableConfigs( document, t ).orders_table;

		updateTable(
			wrapper(),
			config,
			{
				rows: [
					{
						total: '<strong>€5,00</strong>',
						number: 1204,
						customer: '<span class="x">Ann</span>',
					},
					{ number: 0, customer: null, total: false },
				],
			},
			t
		);

		const rows = document.querySelectorAll( '.reports-table tbody tr' );

		expect( rows[ 0 ].innerHTML ).toBe(
			'<td data-column="number">1204</td><td data-column="customer"><span class="x">Ann</span></td><td data-column="total"><strong>€5,00</strong></td>'
		);
		expect( rows[ 1 ].innerHTML ).toBe(
			'<td data-column="number">0</td><td data-column="customer"></td><td data-column="total"></td>'
		);
	} );

	test( 'with no columns known, every value in its order', () => {
		document.body.innerHTML =
			'<div class="reports-table-wrapper"><table class="reports-table"><tbody></tbody></table></div>';

		updateTable(
			wrapper(),
			undefined,
			{ rows: [ { a: 1, b: '<em>2</em>' } ] },
			t
		);

		expect( document.querySelector( 'tbody' ).innerHTML ).toBe(
			'<tr><td data-column="a">1</td><td data-column="b"><em>2</em></td></tr>'
		);
	} );

	test( 'none: the message, as text, across every column', () => {
		document.body.innerHTML =
			'<div class="reports-table-wrapper"><table class="reports-table"><tbody><tr><td>old</td></tr></tbody></table></div>';

		updateTable(
			wrapper(),
			{
				columns: [ { key: 'a' }, { key: 'b' } ],
				rowActions: [ { key: 'edit' } ],
				emptyMessage: '<img src=x onerror=alert(1)>',
			},
			{ rows: [] },
			t
		);

		expect( document.querySelector( 'tbody' ).innerHTML ).toBe(
			'<tr class="reports-table-empty-row"><td colspan="3">&lt;img src=x onerror=alert(1)&gt;</td></tr>'
		);

		updateTable( wrapper(), { columns: [ 'a' ] }, { rows: [] }, t );

		expect( document.querySelector( 'tbody' ).innerHTML ).toBe(
			'<tr class="reports-table-empty-row"><td colspan="1">No data available</td></tr>'
		);
	} );

	test( 'row actions: links from the unformatted row', () => {
		document.body.innerHTML =
			'<div class="reports-table-wrapper"><table class="reports-table"><tbody></tbody></table></div>';

		updateTable(
			wrapper(),
			{
				columns: [ 'id' ],
				rowActions: [
					{
						key: 'edit',
						label: 'Edit',
						url: '/edit?id={id}&name={name}&{missing}',
						class: 'one two',
						target: '_blank',
					},
					{
						key: 'delete',
						url: '/delete/{id}',
						confirm: "It's gone\\",
					},
				],
			},
			{
				rows: [ { id: '1,204', name: 'A&B' } ],
				raw: [ { id: 1204, name: 'A&B', nested: { x: 1 } } ],
			},
			t
		);

		const links = document.querySelectorAll(
			'.reports-row-actions-wrap a'
		);

		expect( links[ 0 ].getAttribute( 'href' ) ).toBe(
			'/edit?id=1204&name=A%26B&{missing}'
		);
		expect( links[ 0 ].className ).toBe(
			'reports-row-action reports-row-action-edit one two'
		);
		expect( links[ 0 ].getAttribute( 'target' ) ).toBe( '_blank' );
		expect( links[ 0 ].hasAttribute( 'onclick' ) ).toBe( false );
		expect( links[ 1 ].textContent ).toBe( 'delete' );
		expect( links[ 1 ].getAttribute( 'onclick' ) ).toBe(
			"return confirm('It\\'s gone\\\\')"
		);
		expect( links[ 1 ].hasAttribute( 'target' ) ).toBe( false );
		expect(
			document.querySelector( '.reports-row-actions-wrap' ).innerHTML
		).toMatch( /<\/a> <span class="sep">\|<\/span> <a /u );
		expect(
			document.querySelector( 'td.reports-table-actions' )
		).not.toBeNull();
	} );

	test( 'a row with no raw values links from what it shows', () => {
		document.body.innerHTML =
			'<div class="reports-table-wrapper"><table class="reports-table"><tbody></tbody></table></div>';

		updateTable(
			wrapper(),
			{
				columns: [ 'id' ],
				rowActions: [ { key: 'view', url: '/v/{id}' } ],
			},
			{ rows: [ { id: 7 } ] },
			t
		);

		expect(
			document
				.querySelector( '.reports-row-action-view' )
				.getAttribute( 'href' )
		).toBe( '/v/7' );
	} );

	test( 'a paged table goes back to page one', () => {
		startReport( { rows: 12, perPage: 5 } );
		press( '3' );

		const container = document.querySelector( '.reports-table-container' );

		updateTable(
			wrapper(),
			readTableConfigs( document, t ).orders_table,
			{
				rows: Array.from( { length: 7 }, ( u, i ) => ( {
					number: i,
					customer: 'c',
					total: 't',
				} ) ),
			},
			t
		);

		expect( data( container, 'current-page' ) ).toBe( 1 );
		expect( info() ).toBe( 'Showing 1-5 of 7' );
	} );

	test( 'no rows to draw: nothing changes', () => {
		startReport( { rows: 2 } );

		const before = document.querySelector( 'tbody' ).innerHTML;

		updateTable( wrapper(), {}, {}, t );
		updateTable( wrapper(), {}, { rows: 'nope' }, t );

		expect( document.querySelector( 'tbody' ).innerHTML ).toBe( before );
	} );
} );
