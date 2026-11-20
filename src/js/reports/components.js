/**
 * The components a refresh draws again: tiles, charts, tables, progress
 * bars, breakdowns and stat lists.
 *
 * The server sends each one worked out and formatted by the code that drew
 * the page, so what is drawn here is what the page would have been drawn
 * with. Icons arrive drawn as well -- the arrow beside a tile's change in
 * the settings, a row's named icon as `icon_html` -- so the script holds no
 * idea of its own of what an icon looks like.
 */

import { all, make, nodes, one, quoted } from '../lib/dom';

/**
 * The small picture a row can carry.
 *
 * A flag, a thumbnail, a logo: the row gives its URL as `icon` and the
 * element is built here, attribute by attribute, the same one the page was
 * drawn with (ProgressRenderer::row_icon()) -- its URL came from a callback
 * this script knows nothing about, and an attribute set this way cannot be
 * talked out of. Decoration, with the words beside it, so the alternative
 * text is empty. A row that names an icon arrives with it drawn, as inline
 * SVG the server built and escaped, and that is inserted as it is.
 *
 * @param {Object} row A breakdown or stat list row.
 * @return {Node[]} The picture, or nothing.
 */
export function rowIcon( row ) {
	if ( row.icon_html ) {
		return nodes( row.icon_html );
	}

	if ( ! row.icon ) {
		return [];
	}

	const image = make( 'img', 'reports-row-icon' );

	image.setAttribute( 'src', row.icon );
	image.setAttribute( 'width', '16' );
	image.setAttribute( 'height', '16' );
	image.setAttribute( 'alt', '' );
	image.setAttribute( 'loading', 'lazy' );
	image.setAttribute( 'decoding', 'async' );

	return [ image ];
}

/**
 * Set the text of whatever matches inside an element.
 *
 * @param {Element} root     Where to look.
 * @param {string}  selector What to set.
 * @param {*}       text     The text.
 */
const setText = ( root, selector, text ) =>
	all( selector, root ).forEach( ( element ) => {
		element.textContent = text;
	} );

/**
 * A tile's figure and its change.
 *
 * The rule the page was drawn by (TileRenderer): a change and a direction
 * to show it in, or an empty chip. The server sends `change: null` for a
 * tile with nothing to compare against -- no earlier figure, or an earlier
 * one of nought -- and that once read as 0, so a refresh gave those tiles a
 * "0.0%" they were not drawn with.
 *
 * @param {Element} tile   The tile.
 * @param {Object}  values The tile's data.
 * @param {Object}  icons  The arrows PHP drew: up, down, neutral.
 */
export function updateTile( tile, values, icons ) {
	if ( values.value !== undefined ) {
		setText(
			tile,
			'.reports-tile-value',
			values.formatted_value || values.value
		);
	}

	if ( values.change === undefined ) {
		return;
	}

	all( '.reports-tile-change', tile ).forEach( ( change ) => {
		change.classList.remove( 'change-up', 'change-down', 'change-neutral' );

		if ( values.change === null || ! values.change_direction ) {
			change.classList.add( 'change-neutral' );
			change.replaceChildren();

			return;
		}

		const direction = [ 'up', 'down' ].includes( values.change_direction )
			? values.change_direction
			: 'neutral';

		change.classList.add( 'change-' + direction );
		change.innerHTML = ( icons || {} )[ direction ] || '';
		change.append(
			document.createTextNode(
				' ' + Math.abs( values.change ).toFixed( 1 ) + '%'
			)
		);
	} );
}

/**
 * A progress bar. The server did the division and the formatting.
 *
 * @param {Element} component The progress wrapper.
 * @param {Object}  values    percent, formatted_percent, formatted_figures.
 */
export function updateProgress( component, values ) {
	const percent = Math.max(
		0,
		Math.min( 100, parseFloat( values.percent ) || 0 )
	);

	all( '.reports-progress-fill', component ).forEach( ( fill ) => {
		fill.style.width = percent + '%';
	} );
	all( '.reports-progress-track', component ).forEach( ( track ) =>
		track.setAttribute( 'aria-valuenow', String( Math.round( percent ) ) )
	);
	setText(
		component,
		'.reports-progress-percent',
		values.formatted_percent || ''
	);
	setText(
		component,
		'.reports-progress-figures',
		values.formatted_figures || ''
	);
}

/**
 * A breakdown's rows: label (with its icon, and a link when it has one),
 * a bar, its share and its figure.
 *
 * @param {Element} component The breakdown wrapper.
 * @param {Object}  values    `rows`.
 */
export function updateBreakdown( component, values ) {
	const list = one( '.reports-breakdown', component );
	const rows = Array.isArray( values.rows ) ? values.rows : [];

	list?.replaceChildren();
	all( '.reports-breakdown-empty', component ).forEach( ( empty ) => {
		empty.hidden = rows.length > 0;
	} );

	rows.forEach( ( row ) => {
		const item = make( 'li', 'reports-breakdown-row' );
		const label = make( 'span', 'reports-breakdown-label' );
		const track = make( 'span', 'reports-breakdown-track' );
		const fill = make( 'span', 'reports-breakdown-fill' );

		label.append( ...rowIcon( row ) );

		if ( row.url ) {
			const link = document.createElement( 'a' );

			link.setAttribute( 'href', row.url );
			link.textContent = row.label || '';
			label.append( link );
		} else {
			label.append( document.createTextNode( row.label || '' ) );
		}

		fill.style.width = ( row.width || 0 ) + '%';
		track.append( fill );

		item.append(
			label,
			track,
			make( 'span', 'reports-breakdown-share', row.share || '' ),
			make( 'span', 'reports-breakdown-value', row.formatted_value || '' )
		);

		list?.append( item );
	} );
}

/**
 * A stat list's rows: a label and a figure, with the row's icon.
 *
 * @param {Element} component The stat list wrapper.
 * @param {Object}  values    `rows`.
 */
export function updateStatList( component, values ) {
	const list = one( '.reports-stat-list', component );
	const rows = Array.isArray( values.rows ) ? values.rows : [];

	list?.replaceChildren();
	all( '.reports-empty', component ).forEach( ( empty ) => {
		empty.hidden = rows.length > 0;
	} );

	rows.forEach( ( row ) => {
		const item = make( 'div', 'reports-stat-row' );
		const figure = document.createElement( 'dd' );

		figure.append(
			...rowIcon( row ),
			document.createTextNode( row.formatted_value || '' )
		);
		item.append( make( 'dt', '', row.label || '' ), figure );

		list?.append( item );
	} );
}

/**
 * Draw every component a refresh sent.
 *
 * @param {Document|Element} root          The page.
 * @param {Object}           components    Component id => its data.
 * @param {Object}           options       What drawing needs.
 * @param {Object}           options.icons The tile arrows PHP drew.
 * @param {Function}         options.chart ( id, data ) => draws a chart.
 * @param {Function}         options.table ( wrapper, id, data ) => draws a table.
 */
export function updateComponents( root, components, { icons, chart, table } ) {
	Object.keys( components || {} ).forEach( ( id ) => {
		const values = components[ id ];
		const elements = all( `[data-component-id="${ quoted( id ) }"]`, root );
		const has = ( name ) =>
			elements.some( ( element ) => element.classList.contains( name ) );

		if ( ! elements.length ) {
			return;
		}

		if ( values.type === 'tile' || has( 'reports-tile' ) ) {
			elements.forEach( ( element ) =>
				updateTile( element, values, icons )
			);
		} else if (
			values.type === 'chart' ||
			has( 'reports-chart-wrapper' )
		) {
			chart( id, values );
		} else if (
			values.type === 'table' ||
			has( 'reports-table-wrapper' )
		) {
			elements.forEach( ( element ) => table( element, id, values ) );
		} else if ( values.type === 'progress' ) {
			elements.forEach( ( element ) =>
				updateProgress( element, values )
			);
		} else if ( values.type === 'breakdown' ) {
			elements.forEach( ( element ) =>
				updateBreakdown( element, values )
			);
		} else if ( values.type === 'stat_list' ) {
			elements.forEach( ( element ) =>
				updateStatList( element, values )
			);
		}
	} );
}
