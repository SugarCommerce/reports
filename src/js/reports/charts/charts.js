/**
 * The charts on a report, drawn with Chart.js from the configuration PHP
 * put on each canvas (`data-chart-config`), and drawn again from what a
 * refresh sends.
 */

import { all } from '../../lib/dom';
import { data } from '../../lib/data';
import { merge } from '../../lib/merge';
import { styleDataset } from './style';

/**
 * Say so when a chart has nothing in it.
 *
 * A line chart of noughts draws a flat line along the bottom and a scale
 * from 0 to 1.0, which looks like a result. It is the absence of one, so
 * the chart steps aside for a sentence.
 *
 * @param {HTMLCanvasElement} canvas The canvas.
 * @param {Object}            values Chart.js data.
 * @param {string}            words  What an empty chart says.
 */
export function markEmptyChart( canvas, values, words ) {
	const container = canvas.closest( '.reports-chart-container' );

	if ( ! container ) {
		return;
	}

	const datasets = ( values && values.datasets ) || [];
	const empty = datasets.every( ( dataset ) =>
		( dataset.data || [] ).every( ( value ) => {
			const number =
				typeof value === 'object' && value !== null ? value.y : value;

			return ! Number( number );
		} )
	);

	container.classList.toggle( 'reports-chart-container--empty', empty );

	if ( empty ) {
		container.setAttribute( 'data-empty-text', words );
	} else {
		container.removeAttribute( 'data-empty-text' );
	}
}

/**
 * The options a chart is drawn with: the report's look, the chart's own
 * options laid over it.
 *
 * @param {Object} config The chart's configuration.
 * @return {Object} Chart.js options.
 */
export function chartOptions( config ) {
	const several = config.data.datasets && config.data.datasets.length > 1;

	const options = merge(
		{
			responsive: true,
			maintainAspectRatio: false,
			// The pointer anywhere over a bucket reads that bucket: no
			// hunting for the line.
			interaction: { mode: 'index', intersect: false },
			plugins: {
				legend: {
					display: several,
					position: 'top',
					align: 'end',
					labels: {
						usePointStyle: true,
						pointStyle: 'circle',
						boxWidth: 6,
						boxHeight: 6,
						color: '#5c5f66',
					},
				},
				tooltip: {
					backgroundColor: '#1f2124',
					titleColor: '#fff',
					bodyColor: '#e6e6e8',
					padding: 12,
					cornerRadius: 8,
					displayColors: several,
					usePointStyle: true,
					boxPadding: 4,
				},
			},
		},
		config.options || {}
	);

	if ( config.type === 'line' || config.type === 'bar' ) {
		// A month of days is thirty labels, and thirty labels turned on
		// their side is a fence under the chart. A handful, read level,
		// with the grid kept to the faint horizontal lines that are
		// actually used to read a value off.
		options.scales = options.scales || {
			x: {
				grid: { display: false },
				border: { display: false },
				ticks: {
					autoSkip: true,
					maxTicksLimit: 8,
					maxRotation: 0,
					color: '#6b6f76',
				},
			},
			y: {
				beginAtZero: true,
				grid: { color: '#eeeef0' },
				border: { display: false },
				ticks: { maxTicksLimit: 6, color: '#6b6f76', padding: 8 },
			},
		};
	}

	return options;
}

/**
 * The charts on a page.
 *
 * @param {Object}    options         What it needs.
 * @param {Function}  options.Chart   Chart.js's Chart.
 * @param {string[]=} options.palette The report's colours.
 * @param {Function}  options.t       Says one of the script's words.
 * @return {Object} { charts, configs, init, create, update, sparklines }.
 */
export function createCharts( { Chart, palette, t } ) {
	const charts = {};
	const configs = {};

	/**
	 * Draw one chart, in place of one drawn there before.
	 *
	 * @param {HTMLCanvasElement} canvas The canvas.
	 * @param {string}            id     The chart's id.
	 * @param {Object}            config Its configuration, styled in place.
	 */
	function create( canvas, id, config ) {
		if ( charts[ id ] ) {
			charts[ id ].destroy();
		}

		if ( config.data && config.data.datasets ) {
			// The stored copy stays as the server sent it. A refresh is
			// styled from that, so what the report left to the script is
			// worked out again from the new data -- not frozen at what it
			// was for the old.
			config.data.datasets = config.data.datasets.map(
				( dataset, index ) =>
					styleDataset( dataset, config.type, index, palette )
			);
		}

		charts[ id ] = new Chart( canvas, {
			type: config.type,
			data: config.data,
			options: chartOptions( config ),
		} );

		markEmptyChart( canvas, config.data, t( 'noChartData' ) );
	}

	/**
	 * Draw a chart again from a refresh.
	 *
	 * What the page was drawn with is kept for whatever the new data does
	 * not say, and what it does say wins: a colour given per bar follows
	 * the data, since the tallest bar this time is not the tallest last
	 * time. The stored copy is JSON, which cannot hold a gradient
	 * function, so the fades are made again by styleDataset().
	 *
	 * @param {string} id     The chart's id.
	 * @param {Object} values `labels` and `datasets`.
	 */
	function update( id, values ) {
		const chart = charts[ id ];
		const original = configs[ id ];

		if ( ! chart || ! values.labels || ! values.datasets ) {
			return;
		}

		chart.data.labels = values.labels;

		const type = original?.type || chart.config.type;

		chart.data.datasets = values.datasets.map( ( dataset, index ) => {
			const drawn = {
				...( original?.data?.datasets?.[ index ] || {} ),
			};

			delete drawn.data;
			delete drawn.label;

			return styleDataset(
				{ ...drawn, ...dataset },
				type,
				index,
				palette
			);
		} );

		chart.update( 'none' );

		markEmptyChart( chart.canvas, chart.data, t( 'noChartData' ) );
	}

	/**
	 * Draw every chart on the page.
	 *
	 * @param {Document|Element} root The page.
	 */
	function init( root ) {
		all( '.reports-chart-canvas', root ).forEach( ( canvas ) => {
			const id = data( canvas, 'chart-id' );
			const config = data( canvas, 'chart-config' );

			if ( config && id ) {
				configs[ id ] = JSON.parse( JSON.stringify( config ) );
				create( canvas, id, config );
			}
		} );
	}

	/**
	 * Draw the small lines in tiles.
	 *
	 * No axes, no legend, no tooltip: it is a shape, not a reading. Anyone
	 * who wants the values wants the chart component, which has all three.
	 *
	 * @param {Document|Element} root The page.
	 */
	function sparklines( root ) {
		all( '[data-sparkline]', root ).forEach( ( canvas ) => {
			let points;

			try {
				points = JSON.parse( canvas.getAttribute( 'data-sparkline' ) );
			} catch {
				return;
			}

			if ( ! Array.isArray( points ) || points.length < 2 ) {
				return;
			}

			const direction = data( canvas, 'direction' );
			let colour = '#787c82';

			if ( direction === 'down' ) {
				colour = '#d63638';
			} else if ( direction === 'up' ) {
				colour = '#00a32a';
			}

			new Chart( canvas, {
				type: 'line',
				data: {
					labels: points.map( () => '' ),
					datasets: [
						{
							data: points,
							borderColor: colour,
							borderWidth: 1.5,
							fill: false,
							pointRadius: 0,
							tension: 0.35,
						},
					],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: { enabled: false },
					},
					scales: { x: { display: false }, y: { display: false } },
					animation: false,
				},
			} );
		} );
	}

	return { charts, configs, init, create, update, sparklines };
}
