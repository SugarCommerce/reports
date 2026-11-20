/**
 * The date range picker: a button that opens a list of presets, and a
 * custom range of two dates. Choosing loads the page again for the period,
 * which is in the address, so the period can be linked to.
 */

import { all, hide, isShown, on, one, show, toggle } from '../lib/dom';
import { data } from '../lib/data';
import { rangeUrl } from './location';

/**
 * Close every picker: its list, its custom range, the presets put back.
 *
 * @param {Document|Element} root The page.
 */
function closeAll( root ) {
	all( '.reports-date-picker-dropdown', root ).forEach( hide );
	all( '.reports-date-picker-custom', root ).forEach( hide );
	all( '.reports-date-picker-presets', root ).forEach( show );
	all( '.reports-date-picker-toggle', root ).forEach( ( button ) =>
		button.setAttribute( 'aria-expanded', 'false' )
	);
}

/**
 * Listen to the pickers on a page.
 *
 * @param {Document|Element} root             The page.
 * @param {Object}           options          What it needs.
 * @param {Function}         options.href     The address now.
 * @param {Function}         options.navigate Loads an address.
 */
export function bindDatePicker( root, { href, navigate } ) {
	const apply = ( preset, start, end ) =>
		navigate( rangeUrl( href(), preset, start, end ) );

	on( root, 'click', '.reports-date-picker-toggle', ( event, button ) => {
		event.preventDefault();
		event.stopPropagation();

		const picker = button.closest( '.reports-date-picker' );
		const dropdown = one( '.reports-date-picker-dropdown', picker );

		all( '.reports-date-picker-dropdown', root )
			.filter( ( other ) => other !== dropdown )
			.forEach( hide );
		all( '.reports-date-picker-toggle', root )
			.filter( ( other ) => other !== button )
			.forEach( ( other ) =>
				other.setAttribute( 'aria-expanded', 'false' )
			);

		toggle( dropdown );
		button.setAttribute(
			'aria-expanded',
			isShown( dropdown ) ? 'true' : 'false'
		);
	} );

	on( root, 'click', '.reports-date-preset', ( event, button ) => {
		event.preventDefault();

		const preset = data( button, 'preset' );
		const picker = button.closest( '.reports-date-picker' );

		all( '.reports-date-preset', picker ).forEach( ( other ) =>
			other.classList.remove( 'active' )
		);
		button.classList.add( 'active' );

		if ( preset === 'custom' ) {
			hide( one( '.reports-date-picker-presets', picker ) );
			show( one( '.reports-date-picker-custom', picker ) );
		} else {
			apply( preset );
		}
	} );

	on( root, 'click', '.reports-date-picker-apply', ( event, button ) => {
		event.preventDefault();

		const picker = button.closest( '.reports-date-picker' );
		const start = one( '.reports-date-start', picker );
		const end = one( '.reports-date-end', picker );

		if ( start && start.value && end && end.value ) {
			apply( 'custom', start.value, end.value );
		}
	} );

	on( root, 'click', '.reports-date-picker-cancel', ( event, button ) => {
		event.preventDefault();

		const picker = button.closest( '.reports-date-picker' );

		hide( one( '.reports-date-picker-custom', picker ) );
		show( one( '.reports-date-picker-presets', picker ) );
		hide( one( '.reports-date-picker-dropdown', picker ) );
	} );

	// A click anywhere else closes them.
	root.addEventListener( 'click', ( event ) => {
		const inside =
			event.target instanceof window.Element &&
			event.target.closest( '.reports-date-picker' );

		if ( ! inside ) {
			closeAll( root );
		}
	} );
}
