/**
 * Filters apply themselves.
 *
 * Choosing a country and then having to press a button to mean it is one
 * step more than the choice needed. A form with a field somebody types into
 * still waits for Enter, so it keeps its button; the others are marked
 * `reports-filter-form--auto`, which hides it.
 */

import { all, isShown, on } from '../lib/dom';

const CHOICES =
	'.reports-filter-form select, .reports-filter-form input[type="checkbox"], .reports-filter-form input[type="radio"], .reports-filter-form input[type="date"]';

/**
 * Mark the forms that have nothing to type into.
 *
 * A combobox has a text input too, but it is the face of a select: what it
 * changes is the select, which is heard.
 *
 * @param {Document|Element} root The page.
 */
export function markAutoForms( root ) {
	all( '.reports-filter-form', root ).forEach( ( form ) => {
		const typed = all(
			'input[type="text"], input[type="search"], input[type="number"]',
			form
		).filter(
			( input ) =>
				! input.matches( '.field-kit__combobox input' ) &&
				isShown( input )
		);

		if ( ! typed.length ) {
			form.classList.add( 'reports-filter-form--auto' );
		}
	} );
}

/**
 * Submit a filter form as soon as one of its choices changes.
 *
 * @param {Document|Element} root The page.
 */
export function bindFilters( root ) {
	on( root, 'change', CHOICES, ( event, field ) => {
		const form = field.closest( 'form' );

		if ( ! form ) {
			return;
		}

		form.classList.add( 'reports-filter-form--busy' );

		if ( typeof form.requestSubmit === 'function' ) {
			form.requestSubmit();
		} else {
			form.submit();
		}
	} );
}
