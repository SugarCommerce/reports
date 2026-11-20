/**
 * A table's rows, drawn again from a refresh.
 *
 * Each table's columns and row actions are read when the page loads -- from
 * `data-table-config`, which PHP writes, or from the headings and the first
 * row when it did not -- and the rows a refresh sends are drawn in that
 * order.
 */

import { all, make, one } from '../../lib/dom';
import { data, setData } from '../../lib/data';
import { applyPagination } from './paging';

/**
 * A value for a JavaScript string in single quotes, inside an attribute.
 *
 * Backslash first, or the escapes added after it are escaped again. PHP's
 * esc_js() runs addslashes(), which covers all three; this once covered
 * two, so a value ending in a backslash closed the string it was supposed
 * to be inside and everything after it was code.
 *
 * @param {*} text The value.
 * @return {*} The escaped text; anything not a string as it was.
 */
export function escapeJs( text ) {
	if ( typeof text !== 'string' ) {
		return text;
	}

	return text
		.replace( /\\/g, '\\\\' )
		.replace( /'/g, "\\'" )
		.replace( /"/g, '\\"' );
}

/**
 * A table's columns and row actions, read from what the page shows.
 *
 * For a table PHP drew without `data-table-config`.
 *
 * @param {Element}  wrapper The `.reports-table-wrapper`.
 * @param {Function} t       Says one of the script's words.
 * @return {Object} columns, rowActions, emptyMessage, paginated, perPage.
 */
export function readTableConfig( wrapper, t ) {
	const table = one( '.reports-table', wrapper );
	const container = one( '.reports-table-container', wrapper );
	const columns = [];
	const rowActions = [];

	all( 'thead th', table ).forEach( ( th ) => {
		const key = data( th, 'column' );

		if ( th.classList.contains( 'reports-table-actions-col' ) || ! key ) {
			return;
		}

		columns.push( {
			key,
			label: th.textContent.trim(),
			sortable: th.classList.contains( 'sortable' ),
			// Not something the page shows.
			format: '',
		} );
	} );

	const firstRow = one( 'tbody tr', table );

	all( '.reports-row-actions-wrap a', firstRow ).forEach( ( link ) => {
		const classes = link.getAttribute( 'class' ) || '';
		const match = classes.match( /reports-row-action-(\S+)/ );
		const key = match ? match[ 1 ] : '';

		if ( ! key || key === 'row' ) {
			return;
		}

		rowActions.push( {
			key,
			label: link.textContent.trim(),
			url: link.getAttribute( 'href' ) || '#',
			class:
				link
					.getAttribute( 'class' )
					?.replace( /reports-row-action[^\s]*/g, '' )
					.trim() || '',
			confirm:
				link
					.getAttribute( 'onclick' )
					?.match( /confirm\('([^']+)'\)/ )?.[ 1 ] || '',
			target: link.getAttribute( 'target' ) || '',
		} );
	} );

	const paginated = data( container, 'paginated' );

	return {
		columns,
		rowActions,
		emptyMessage:
			all( '.reports-table-empty p', wrapper )
				.map( ( p ) => p.textContent )
				.join( '' ) || t( 'noData' ),
		paginated: paginated === true || paginated === 'true',
		perPage: parseInt( data( container, 'per-page' ), 10 ) || 10,
	};
}

/**
 * Every table's configuration, by component id.
 *
 * @param {Document|Element} root The page.
 * @param {Function}         t    Says one of the script's words.
 * @return {Object} Component id => configuration.
 */
export function readTableConfigs( root, t ) {
	const configs = {};

	all( '.reports-table-wrapper', root ).forEach( ( wrapper ) => {
		const id = data( wrapper, 'component-id' );

		if ( id ) {
			configs[ id ] =
				data( wrapper, 'table-config' ) ||
				readTableConfig( wrapper, t );
		}
	} );

	return configs;
}

/**
 * A row's actions cell.
 *
 * @param {Object[]} actions The row actions.
 * @param {Object}   raw     The row's unformatted values.
 * @return {Element} The cell.
 */
function actionsCell( actions, raw ) {
	const cell = make( 'td', 'reports-table-actions' );
	const wrap = make( 'div', 'reports-row-actions-wrap' );

	actions.forEach( ( action, index ) => {
		if ( index > 0 ) {
			wrap.insertAdjacentHTML(
				'beforeend',
				' <span class="sep">|</span> '
			);
		}

		// The {placeholders} filled from the unformatted row: an id
		// formatted for display is 1,204 and links to nothing.
		let url = action.url || '#';

		Object.keys( raw ).forEach( ( key ) => {
			if (
				typeof raw[ key ] === 'string' ||
				typeof raw[ key ] === 'number'
			) {
				url = url.replace(
					'{' + key + '}',
					encodeURIComponent( raw[ key ] )
				);
			}
		} );

		const link = document.createElement( 'a' );

		link.setAttribute( 'href', url );
		link.className = 'reports-row-action reports-row-action-' + action.key;
		link.textContent = action.label || action.key;

		if ( action.class ) {
			link.classList.add(
				...String( action.class ).split( /\s+/ ).filter( Boolean )
			);
		}

		if ( action.confirm ) {
			link.setAttribute(
				'onclick',
				"return confirm('" + escapeJs( action.confirm ) + "')"
			);
		}

		if ( action.target ) {
			link.setAttribute( 'target', action.target );
		}

		wrap.append( link );
	} );

	cell.append( wrap );

	return cell;
}

/**
 * A cell, with the markup the server sent.
 *
 * The cells arrive formatted and sanitized: the server runs them through
 * the same formatter that rendered the page and the same wp_kses_post()
 * that wrote it. Formatting them again here is how the refresh came to
 * print dollars on a site set to euros.
 *
 * @param {string} column The column key.
 * @param {*}      value  The cell's markup.
 * @return {Element} The cell.
 */
function cellFor( column, value ) {
	const td = document.createElement( 'td' );

	td.setAttribute( 'data-column', column );
	td.innerHTML = [ undefined, null, false ].includes( value )
		? ''
		: String( value );

	return td;
}

/**
 * Draw a table's rows again.
 *
 * @param {Element}  wrapper The `.reports-table-wrapper`.
 * @param {Object}   config  Its configuration (readTableConfigs()).
 * @param {Object}   values  `rows`, and `raw`: the same rows unformatted.
 * @param {Function} t       Says one of the script's words.
 */
export function updateTable( wrapper, config, values, t ) {
	if ( ! values.rows || ! Array.isArray( values.rows ) ) {
		return;
	}

	const body = one( '.reports-table tbody', wrapper );
	const columns = ( config && config.columns ) || [];
	const actions = ( config && config.rowActions ) || [];

	if ( body ) {
		body.replaceChildren();
	}

	if ( values.rows.length === 0 ) {
		const row = make( 'tr', 'reports-table-empty-row' );
		const only = make(
			'td',
			'',
			( config && config.emptyMessage ) || t( 'noData' )
		);

		only.setAttribute(
			'colspan',
			String( columns.length + ( actions.length > 0 ? 1 : 0 ) )
		);
		row.append( only );
		body?.append( row );

		return;
	}

	values.rows.forEach( ( row, index ) => {
		const tr = document.createElement( 'tr' );
		const raw = ( values.raw && values.raw[ index ] ) || row;

		if ( columns.length > 0 ) {
			columns.forEach( ( column ) => {
				const key = column.key || column;

				tr.append( cellFor( key, row[ key ] ) );
			} );
		} else {
			// No columns known: every value, in the order it came.
			Object.keys( row ).forEach( ( key ) =>
				tr.append( cellFor( key, row[ key ] ) )
			);
		}

		if ( actions.length > 0 ) {
			tr.append( actionsCell( actions, raw ) );
		}

		body?.append( tr );
	} );

	const container = one( '.reports-table-container', wrapper );

	if ( container && data( container, 'paginated' ) ) {
		setData( container, 'current-page', 1 );
		applyPagination( container, t );
	}
}
