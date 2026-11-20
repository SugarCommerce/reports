/**
 * A table's pages: the rows of one page shown, the others hidden, and the
 * buttons under it -- Previous, five page numbers with the first and last
 * either side of an ellipsis, Next.
 */

import { all, hide, make, on, one, show } from '../../lib/dom';
import { data, setData } from '../../lib/data';

/**
 * The numbers to offer, around the page being read.
 *
 * @param {number} current The page being read.
 * @param {number} total   How many pages.
 * @return {{first: number, last: number}} The first and last number shown.
 */
export function pageWindow( current, total ) {
	const most = 5;
	let first = Math.max( 1, current - Math.floor( most / 2 ) );
	const last = Math.min( total, first + most - 1 );

	// Near the end, the window reaches back so it still shows five.
	if ( last - first < most - 1 ) {
		first = Math.max( 1, last - most + 1 );
	}

	return { first, last };
}

/**
 * A page button.
 *
 * @param {string|number} label   What it says.
 * @param {number}        page    The page it goes to.
 * @param {boolean=}      current The page being read.
 * @return {HTMLButtonElement} The button.
 */
function pageButton( label, page, current = false ) {
	const button = document.createElement( 'button' );

	button.type = 'button';
	button.className = current ? 'button button-primary' : 'button';
	button.textContent = String( label );
	setData( button, 'page', page );

	if ( current ) {
		button.disabled = true;
	}

	return button;
}

/**
 * Show the page a table is on, and draw its buttons.
 *
 * @param {Element}  container The table's `.reports-table-container`.
 * @param {Function} t         Says one of the script's words.
 */
export function applyPagination( container, t ) {
	const table = one( '.reports-table', container );
	const rows = all( 'tbody tr', table );
	const current = data( container, 'current-page' ) || 1;
	const perPage = parseInt( data( container, 'per-page' ), 10 ) || 10;
	const total = rows.length;
	const pages = Math.ceil( total / perPage );
	const start = ( current - 1 ) * perPage;
	const end = start + perPage;

	rows.forEach( hide );
	rows.slice( start, end ).forEach( show );

	let pagination = one( '.reports-table-pagination', container );

	if ( ! pagination && pages > 1 ) {
		pagination = make( 'div', 'reports-table-pagination' );
		pagination.append(
			make( 'span', 'reports-table-info' ),
			make( 'div', 'reports-table-pages' )
		);
		container.append( pagination );
	}

	if ( ! pagination ) {
		return;
	}

	all( '.reports-table-info', pagination ).forEach( ( info ) => {
		info.textContent = t(
			'showing',
			start + 1,
			Math.min( end, total ),
			total
		);
	} );

	const buttons = one( '.reports-table-pages', pagination );

	if ( buttons ) {
		buttons.replaceChildren();
	}

	if ( pages <= 1 ) {
		hide( pagination );
		return;
	}

	show( pagination );

	if ( ! buttons ) {
		return;
	}

	const previous = pageButton( 'Previous', current - 1 );
	previous.disabled = current <= 1;
	buttons.append( previous );

	const { first, last } = pageWindow( current, pages );

	if ( first > 1 ) {
		buttons.append( pageButton( 1, 1 ) );

		if ( first > 2 ) {
			buttons.append( make( 'span', 'ellipsis', '…' ) );
		}
	}

	for ( let page = first; page <= last; page++ ) {
		buttons.append( pageButton( page, page, page === current ) );
	}

	if ( last < pages ) {
		if ( last < pages - 1 ) {
			buttons.append( make( 'span', 'ellipsis', '…' ) );
		}

		buttons.append( pageButton( pages, pages ) );
	}

	const next = pageButton( 'Next', current + 1 );
	next.disabled = current >= pages;
	buttons.append( next );
}

/**
 * Turn to the first page of every paged table.
 *
 * @param {Document|Element} root The page.
 * @param {Function}         t    Says one of the script's words.
 */
export function initPagination( root, t ) {
	all( '.reports-table-container[data-paginated="true"]', root ).forEach(
		( container ) => {
			setData( container, 'current-page', 1 );
			applyPagination( container, t );
		}
	);
}

/**
 * Listen to the page buttons.
 *
 * @param {Document|Element} root The page.
 * @param {Function}         t    Says one of the script's words.
 */
export function bindPaging( root, t ) {
	on( root, 'click', '.reports-table-pages button', ( event, button ) => {
		if ( button.disabled ) {
			return;
		}

		const container = button.closest( '.reports-table-container' );

		if ( ! container ) {
			return;
		}

		setData(
			container,
			'current-page',
			parseInt( data( button, 'page' ), 10 )
		);
		applyPagination( container, t );
	} );
}
