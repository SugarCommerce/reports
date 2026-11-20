/**
 * Sorting a table by a column heading: ascending first, then the other way.
 * Figures compare as numbers -- `$1,204.50` is 1204.5 -- and anything else
 * as text.
 */

import { all, on, one } from '../../lib/dom';

/**
 * A row's text in one column.
 *
 * @param {Element} row   The row.
 * @param {number}  index The column.
 * @return {string} Its text, trimmed.
 */
const cellText = ( row, index ) => {
	const cell = all( 'td', row )[ index ];

	return cell ? cell.textContent.trim() : '';
};

/**
 * Compare two cells' text, numbers as numbers.
 *
 * @param {string}  a          One.
 * @param {string}  b          The other.
 * @param {boolean} descending Largest first.
 * @return {number} The order.
 */
export function compareCells( a, b, descending ) {
	const aNumber = parseFloat( a.replace( /[^0-9.-]/g, '' ) );
	const bNumber = parseFloat( b.replace( /[^0-9.-]/g, '' ) );

	if ( ! isNaN( aNumber ) && ! isNaN( bNumber ) ) {
		return descending ? bNumber - aNumber : aNumber - bNumber;
	}

	return descending ? b.localeCompare( a ) : a.localeCompare( b );
}

/**
 * Listen to the sortable headings.
 *
 * @param {Document|Element} root The page.
 */
export function bindSorting( root ) {
	on( root, 'click', '.reports-table th.sortable', ( event, heading ) => {
		const table = heading.closest( '.reports-table' );
		const descending = heading.classList.contains( 'sorted-asc' );

		all( 'th', table ).forEach( ( th ) =>
			th.classList.remove( 'sorted-asc', 'sorted-desc' )
		);
		heading.classList.add( descending ? 'sorted-desc' : 'sorted-asc' );

		const body = one( 'tbody', table );

		if ( ! body ) {
			return;
		}

		const index = Array.from( heading.parentElement.children ).indexOf(
			heading
		);
		const rows = all( 'tbody tr', table );

		rows.sort( ( a, b ) =>
			compareCells(
				cellText( a, index ),
				cellText( b, index ),
				descending
			)
		);

		body.append( ...rows );
	} );
}
