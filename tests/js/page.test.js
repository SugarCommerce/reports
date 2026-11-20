/**
 * The page around the components: notices gathered under the header, the
 * current section scrolled into view, the date picker, the filters that
 * apply themselves, and Screen Options.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { revealCurrentSection } from '../../src/js/reports/page';
import {
	cleanup,
	click,
	flush,
	layout,
	SETTINGS,
	startReport,
} from './support/page';

beforeEach( layout );
afterEach( cleanup );

const $ = ( selector ) => document.querySelector( selector );
const shown = ( selector ) => $( selector ).offsetWidth > 0;

describe( 'notices', () => {
	test( 'stray ones move under the header, in order; the kept stay', () => {
		startReport();

		expect(
			[ ...$( '.reports-notices' ).children ].map( ( n ) => n.className )
		).toEqual( [
			'notice kept',
			'notice notice-warning stray-inside',
			'notice notice-info stray-before',
			'notice notice-error stray-after',
		] );
	} );

	test( 'and beside the shell, when the sections are down the side', () => {
		startReport( {
			html: `<div class="reports-shell-holder"><div class="notice beside">x</div><div class="reports-shell"><div class="wrap reports-wrap"><div class="reports-notices"></div></div></div><div class="updated after">y</div></div>`,
		} );

		expect(
			[ ...$( '.reports-notices' ).children ].map( ( n ) => n.className )
		).toEqual( [ 'notice beside', 'updated after' ] );
	} );

	test( 'no container: nothing moves', () => {
		startReport( {
			html: '<div class="notice a">x</div><div class="wrap reports-wrap"><div class="error b">y</div></div>',
		} );

		expect( $( '.a' ).parentElement ).toBe( document.body );
		expect( $( '.b' ).parentElement ).toBe( $( '.reports-wrap' ) );
	} );
} );

describe( 'the current section, in a row that scrolls', () => {
	/**
	 * A row and its current link, by their measurements.
	 *
	 * @param {string} rowClass   The row's class.
	 * @param {string} linkMarkup The current link.
	 * @param {number} width      How wide the row's contents are.
	 * @return {Element} The row.
	 */
	function row( rowClass, linkMarkup, width ) {
		document.body.innerHTML = `<div class="reports"><div class="${ rowClass }">${ linkMarkup }</div></div>`;

		const element = document.querySelector( '.' + rowClass );
		const link = element.firstElementChild;

		Object.defineProperty( element, 'scrollWidth', { value: width } );
		Object.defineProperty( element, 'clientWidth', { value: 390 } );
		element.getBoundingClientRect = () => ( { left: 0, width: 390 } );
		link.getBoundingClientRect = () => ( { left: 800, width: 90 } );

		return element;
	}

	test( 'an overflowing row centres the current link', () => {
		// 800 from the row's edge, in a 390 row, 90 wide: 800 - 150.
		const sidebar = row(
			'reports-sidebar-scroll',
			'<a class="reports-sidebar-link" aria-current="page">Nine</a>',
			1289
		);

		revealCurrentSection( document );
		expect( sidebar.scrollLeft ).toBe( 650 );

		const tabs = row(
			'field-kit__page-tabs',
			'<a class="field-kit__page-tab" aria-current="page">Nine</a>',
			1289
		);

		revealCurrentSection( document );
		expect( tabs.scrollLeft ).toBe( 650 );
	} );

	test( 'a row that fits is not scrolled', () => {
		const sidebar = row(
			'reports-sidebar-scroll',
			'<a class="reports-sidebar-link" aria-current="page">One</a>',
			390
		);

		revealCurrentSection( document );
		expect( sidebar.scrollLeft ).toBe( 0 );
	} );

	test( 'a link that is not current, or not in a row, is left alone', () => {
		const sidebar = row(
			'reports-sidebar-scroll',
			'<a class="reports-sidebar-link">One</a>',
			1289
		);

		revealCurrentSection( document );
		expect( sidebar.scrollLeft ).toBe( 0 );

		document.body.innerHTML =
			'<a class="reports-sidebar-link" aria-current="page">Loose</a>';
		expect( () => revealCurrentSection( document ) ).not.toThrow();
	} );
} );

describe( 'the date picker', () => {
	const href =
		'https://example.test/wp-admin/admin.php?page=reports&tab=sales&date_start=2026-01-01&date_end=2026-01-31&date_preset=custom';

	test( 'the toggle opens and closes the list', () => {
		startReport();

		const toggle = $( '.reports-date-picker-toggle' );

		click( toggle );
		expect( shown( '.reports-date-picker-dropdown' ) ).toBe( true );
		expect( toggle.getAttribute( 'aria-expanded' ) ).toBe( 'true' );

		click( toggle );
		expect( shown( '.reports-date-picker-dropdown' ) ).toBe( false );
		expect( toggle.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
	} );

	test( "the toggle's click goes no further", () => {
		startReport();

		const event = new window.MouseEvent( 'click', {
			bubbles: true,
			cancelable: true,
		} );
		const outside = vi.fn();

		window.addEventListener( 'click', outside );
		$( '.reports-date-picker-toggle' ).dispatchEvent( event );
		window.removeEventListener( 'click', outside );

		expect( event.defaultPrevented ).toBe( true );
		expect( outside ).not.toHaveBeenCalled();
	} );

	test( 'opening one picker closes another', () => {
		startReport();

		const picker = $( '.reports-date-picker' );

		picker.after( picker.cloneNode( true ) );

		const [ first, second ] = document.querySelectorAll(
			'.reports-date-picker-toggle'
		);
		const [ one, two ] = document.querySelectorAll(
			'.reports-date-picker-dropdown'
		);

		click( first );
		click( second );

		expect( one.offsetWidth ).toBe( 0 );
		expect( two.offsetWidth ).toBeGreaterThan( 0 );
		expect( first.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
		expect( second.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
	} );

	test( 'a click elsewhere closes it, and puts the presets back', () => {
		startReport();

		click( $( '.reports-date-picker-toggle' ) );
		click( $( '.reports-date-preset[data-preset="custom"]' ) );
		expect( shown( '.reports-date-picker-custom' ) ).toBe( true );

		// A click inside the picker leaves it open.
		click( $( '.reports-date-start' ) );
		expect( shown( '.reports-date-picker-dropdown' ) ).toBe( true );

		click( $( '.reports-content' ) );
		expect( shown( '.reports-date-picker-dropdown' ) ).toBe( false );
		expect( $( '.reports-date-picker-custom' ).style.display ).toBe(
			'none'
		);
		expect( $( '.reports-date-picker-presets' ).style.display ).toBe( '' );
		expect(
			$( '.reports-date-picker-toggle' ).getAttribute( 'aria-expanded' )
		).toBe( 'false' );
	} );

	test( 'a preset loads the page for it, without a custom range', () => {
		const { navigated } = startReport( { href } );

		click( $( '.reports-date-picker-toggle' ) );
		click( $( '.reports-date-preset[data-preset="today"]' ) );

		expect( navigated ).toEqual( [
			'https://example.test/wp-admin/admin.php?page=reports&tab=sales&date_preset=today',
		] );
		expect( $( '.reports-date-preset.active' ).dataset.preset ).toBe(
			'today'
		);
	} );

	test( 'Custom swaps the presets for the dates; Apply needs both', () => {
		const { navigated } = startReport( { href } );

		click( $( '.reports-date-preset[data-preset="custom"]' ) );

		expect( shown( '.reports-date-picker-presets' ) ).toBe( false );
		expect( $( '.reports-date-picker-custom' ).style.display ).toBe( '' );
		expect(
			[
				...document.querySelectorAll( '.reports-date-preset.active' ),
			].map( ( b ) => b.dataset.preset )
		).toEqual( [ 'custom' ] );
		expect( navigated ).toEqual( [] );

		$( '.reports-date-start' ).value = '2026-02-01';
		click( $( '.reports-date-picker-apply' ) );
		expect( navigated ).toEqual( [] );

		$( '.reports-date-end' ).value = '2026-02-10';
		click( $( '.reports-date-picker-apply' ) );
		expect( navigated ).toEqual( [
			'https://example.test/wp-admin/admin.php?page=reports&tab=sales&date_start=2026-02-01&date_end=2026-02-10&date_preset=custom',
		] );
	} );

	test( 'Cancel puts the presets back and closes it', () => {
		startReport();

		click( $( '.reports-date-picker-toggle' ) );
		click( $( '.reports-date-preset[data-preset="custom"]' ) );
		click( $( '.reports-date-picker-cancel' ) );

		expect( $( '.reports-date-picker-custom' ).style.display ).toBe(
			'none'
		);
		expect( $( '.reports-date-picker-presets' ).style.display ).toBe( '' );
		expect( $( '.reports-date-picker-dropdown' ).style.display ).toBe(
			'none'
		);
	} );
} );

describe( 'filters apply themselves', () => {
	test( 'a form with nothing to type into is marked, and submits on a choice', () => {
		startReport();

		const form = $( '.reports-filter-form' );
		const submit = vi.fn( ( event ) => event.preventDefault() );

		form.addEventListener( 'submit', submit );

		expect( form.classList.contains( 'reports-filter-form--auto' ) ).toBe(
			true
		);

		const select = $( 'select.status' );

		select.value = 'complete';
		select.dispatchEvent( new window.Event( 'change', { bubbles: true } ) );

		expect( submit ).toHaveBeenCalledTimes( 1 );
		expect( form.classList.contains( 'reports-filter-form--busy' ) ).toBe(
			true
		);
	} );

	test( 'checkboxes, radios and dates submit too; a typed field does not', () => {
		startReport( {
			html: `<form class="reports-filter-form">
				<input type="checkbox" name="a"><input type="radio" name="b"><input type="date" name="c">
				<input type="text" name="d"><input type="search" name="e" style="display:none">
			</form>`,
		} );

		const form = $( 'form' );
		const submit = vi.fn( ( event ) => event.preventDefault() );

		form.addEventListener( 'submit', submit );

		[ 'a', 'b', 'c', 'd' ].forEach( ( name ) =>
			$( `[name="${ name }"]` ).dispatchEvent(
				new window.Event( 'change', { bubbles: true } )
			)
		);

		expect( submit ).toHaveBeenCalledTimes( 3 );
		expect( form.classList.contains( 'reports-filter-form--auto' ) ).toBe(
			false
		);
	} );

	test( "a combobox's text input, or a hidden one, does not keep the button", () => {
		startReport( {
			html: `<form class="reports-filter-form"><div class="field-kit__combobox"><input type="text"></div><input type="number" hidden></form>
				<form class="reports-filter-form"><input type="number"></form>`,
		} );

		const [ combo, typed ] = document.querySelectorAll( 'form' );

		expect( combo.classList.contains( 'reports-filter-form--auto' ) ).toBe(
			true
		);
		expect( typed.classList.contains( 'reports-filter-form--auto' ) ).toBe(
			false
		);
	} );

	test( 'without requestSubmit, the form is submitted', () => {
		startReport();

		const form = $( '.reports-filter-form' );

		form.requestSubmit = undefined;
		form.submit = vi.fn();
		$( 'select.status' ).dispatchEvent(
			new window.Event( 'change', { bubbles: true } )
		);

		expect( form.submit ).toHaveBeenCalledTimes( 1 );
	} );
} );

describe( 'Screen Options', () => {
	const box = ( value ) =>
		$( `.reports-screen-options input[value="${ value }"]` );
	const component = ( id ) =>
		$( `.reports-wrap [data-component-id="${ id }"]` );

	test( 'unticking hides the component at once and saves the choice', async () => {
		const routes = {
			'screen-options': vi.fn( () => ( { success: true } ) ),
		};
		const { apiFetch, reload } = startReport( { routes } );

		click( box( 'over_time' ) );

		expect( component( 'over_time' ).style.display ).toBe( 'none' );

		await flush();

		const [ request ] = apiFetch.calls;

		expect( request ).toEqual( {
			url: SETTINGS.restUrl + 'screen-options',
			method: 'POST',
			headers: {
				'X-WP-Nonce': SETTINGS.restNonce,
				'Content-Type': 'application/json',
			},
			parse: true,
			body: '{"report_id":"sales","tab":"overview","shown":["countries"]}',
		} );
		expect( reload ).not.toHaveBeenCalled();

		click( box( 'over_time' ) );
		await flush();

		expect( component( 'over_time' ).style.display ).toBe( '' );
		expect( JSON.parse( apiFetch.calls[ 1 ].body ).shown ).toEqual( [
			'over_time',
			'countries',
		] );
		expect( reload ).not.toHaveBeenCalled();
	} );

	test( 'ticking one that is not on the page reloads, once saved', async () => {
		const { reload } = startReport( {
			routes: { 'screen-options': () => ( { success: true } ) },
		} );

		component( 'countries' ).remove();
		click( box( 'countries' ) );
		await flush();
		expect( reload ).not.toHaveBeenCalled();

		click( box( 'countries' ) );
		await flush();
		expect( reload ).toHaveBeenCalledTimes( 1 );
	} );

	test( 'a refused save puts the box and the component back', async () => {
		const { reload } = startReport();

		click( box( 'over_time' ) );
		expect( component( 'over_time' ).style.display ).toBe( 'none' );

		await flush();

		expect( box( 'over_time' ).checked ).toBe( true );
		expect( component( 'over_time' ).style.display ).toBe( '' );
		expect( reload ).not.toHaveBeenCalled();
	} );
} );
