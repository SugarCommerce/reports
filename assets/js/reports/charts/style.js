/**
 * The report's look for a chart's datasets, where a dataset says nothing.
 */

/**
 * The palette, when PHP sent none (`chartDefaults.colors`).
 */
export const PALETTE = [
	'#3b82f6',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#8b5cf6',
	'#ec4899',
	'#06b6d4',
	'#84cc16',
];

/**
 * A hex colour with an alpha.
 *
 * @param {string} hex   `#3b82f6`.
 * @param {number} alpha 0 to 1.
 * @return {string} `rgba(59, 130, 246, 0.2)`.
 */
export function hexToRgba( hex, alpha ) {
	const r = parseInt( hex.slice( 1, 3 ), 16 );
	const g = parseInt( hex.slice( 3, 5 ), 16 );
	const b = parseInt( hex.slice( 5, 7 ), 16 );

	return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

/**
 * A bar's fill: the colour at its top, softer towards its foot.
 *
 * @param {string} color The series colour (hex).
 * @return {Function|string} A scriptable background, or the colour.
 */
export function fadeDown( color ) {
	if ( typeof color !== 'string' || color.charAt( 0 ) !== '#' ) {
		return color;
	}

	return ( context ) => {
		const chart = context.chart;
		const area = chart.chartArea;

		if ( ! area ) {
			return color;
		}

		const gradient = chart.ctx.createLinearGradient(
			0,
			area.top,
			0,
			area.bottom
		);

		gradient.addColorStop( 0, hexToRgba( color, 1 ) );
		gradient.addColorStop( 1, hexToRgba( color, 0.55 ) );

		return gradient;
	};
}

/**
 * A fill that fades from a colour to nothing, top to bottom.
 *
 * A function, which Chart.js calls once it knows how tall the plot is --
 * the gradient has to span the plot, and that is not known until the chart
 * has been laid out.
 *
 * @param {string} color The line's colour (hex).
 * @return {Function|string} A scriptable background, or the colour.
 */
export function fadeUnder( color ) {
	if ( typeof color !== 'string' || color.charAt( 0 ) !== '#' ) {
		return color;
	}

	return ( context ) => {
		const chart = context.chart;
		const area = chart.chartArea;

		// Not laid out yet: a flat tint for the first pass.
		if ( ! area ) {
			return hexToRgba( color, 0.12 );
		}

		const gradient = chart.ctx.createLinearGradient(
			0,
			area.top,
			0,
			area.bottom
		);

		gradient.addColorStop( 0, hexToRgba( color, 0.28 ) );
		gradient.addColorStop( 0.6, hexToRgba( color, 0.08 ) );
		gradient.addColorStop( 1, hexToRgba( color, 0 ) );

		return gradient;
	};
}

/**
 * Style one dataset, keeping whatever it says itself.
 *
 * By the dataset's own type when it has one, so bars and a line drawn
 * together each look like themselves. A colour the dataset gives -- one,
 * or one per bar -- is kept, and is what a bar turns on hover as well.
 *
 * @param {Object}    dataset A Chart.js dataset, changed in place.
 * @param {string}    type    The chart's type.
 * @param {number}    index   Its place among the datasets.
 * @param {string[]=} palette The report's colours.
 * @return {Object} The dataset.
 */
export function styleDataset( dataset, type, index, palette ) {
	const colors = palette || PALETTE;
	const color = colors[ index % colors.length ];
	const kind = dataset.type || type;
	const given = ( key, fallback ) =>
		dataset[ key ] !== undefined ? dataset[ key ] : fallback;

	if ( kind === 'line' || kind === 'area' ) {
		dataset.borderColor = dataset.borderColor || color;

		// A wash under the line that fades out towards the axis: full
		// enough near the line to read as a shape, gone by the bottom so
		// the grid shows through. A flat tint made the area a slab.
		dataset.backgroundColor =
			dataset.backgroundColor || fadeUnder( dataset.borderColor );
		dataset.tension = given( 'tension', 0.4 );
		dataset.fill = dataset.fill !== false;
		dataset.borderWidth = given( 'borderWidth', 2.5 );

		// No dot on every point -- thirty of them is a string of beads.
		// One appears under the pointer.
		dataset.pointRadius = given( 'pointRadius', 0 );
		dataset.pointHoverRadius = given( 'pointHoverRadius', 5 );
		dataset.pointHoverBackgroundColor =
			dataset.pointHoverBackgroundColor || '#fff';
		dataset.pointHoverBorderWidth = given( 'pointHoverBorderWidth', 2.5 );
	} else if ( kind === 'bar' ) {
		const own = dataset.backgroundColor;

		// One colour for one series. The palette is for telling series
		// apart, and painted across the bars of a single series it made a
		// rainbow of months. The same fade as under a line, the other way
		// up: solid at the top of the bar, lighter at its foot, so a few
		// bars on a wide chart read as shapes rather than blocks.
		dataset.backgroundColor = own || fadeDown( color );

		// A bar the report coloured -- the best month picked out from its
		// tinted neighbours -- keeps its colour under the pointer rather
		// than turning the palette's.
		dataset.hoverBackgroundColor =
			dataset.hoverBackgroundColor || own || color;
		dataset.borderRadius = given( 'borderRadius', 8 );
		dataset.borderSkipped = given( 'borderSkipped', false );

		// Wide enough to look deliberate when there are only four or five
		// of them, capped so twelve do not become a wall.
		dataset.maxBarThickness = given( 'maxBarThickness', 64 );
		dataset.categoryPercentage = given( 'categoryPercentage', 0.6 );
	} else if ( kind === 'pie' || kind === 'doughnut' ) {
		dataset.backgroundColor = dataset.backgroundColor || colors;
	}

	return dataset;
}
