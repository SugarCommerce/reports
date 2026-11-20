/**
 * The charts: the report's look for datasets that say nothing, the options
 * a chart is drawn with, the sentence an empty chart shows, and a refresh
 * drawing what the new data says.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	chartOptions,
	createCharts,
	markEmptyChart,
} from '../../assets/js/reports/charts/charts';
import {
	fadeDown,
	fadeUnder,
	hexToRgba,
	PALETTE,
	styleDataset,
} from '../../assets/js/reports/charts/style';
import { translator } from '../../assets/js/lib/text';
import { chartConfig, FakeChart, STRINGS } from './support/page';

const t = translator( STRINGS );

afterEach( () => {
	document.body.innerHTML = '';
	FakeChart.made = [];
} );

/**
 * A chart's canvas in its container.
 *
 * @param {Object} config The chart's configuration.
 * @param {string} id     Its id.
 * @return {HTMLCanvasElement} The canvas.
 */
function canvas( config = chartConfig(), id = 'sales' ) {
	document.body.insertAdjacentHTML(
		'beforeend',
		`<div class="reports-chart-container"><canvas class="reports-chart-canvas" data-chart-id="${ id }"></canvas></div>`
	);

	const element = document.body.lastElementChild.firstElementChild;

	element.setAttribute( 'data-chart-config', JSON.stringify( config ) );

	return element;
}

/**
 * What a scriptable fill makes, against a chart laid out or not.
 *
 * @param {Function} fill The fill.
 * @param {Object=}  area The chart area, or nothing yet.
 * @return {Object} The gradient's stops, or the flat colour.
 */
function paint( fill, area ) {
	const stops = [];
	const ctx = {
		createLinearGradient: ( ...span ) => ( {
			span,
			stops,
			addColorStop: ( at, colour ) => stops.push( [ at, colour ] ),
		} ),
	};

	return fill( { chart: { chartArea: area, ctx } } );
}

describe( 'colours', () => {
	test( 'hexToRgba', () => {
		expect( hexToRgba( '#2271b1', 0.2 ) ).toBe( 'rgba(34, 113, 177, 0.2)' );
		expect( hexToRgba( '#000000', 1 ) ).toBe( 'rgba(0, 0, 0, 1)' );
	} );

	test( 'the fade under a line: a tint until laid out, then top to bottom', () => {
		const fill = fadeUnder( '#ff0000' );

		expect( paint( fill ) ).toBe( 'rgba(255, 0, 0, 0.12)' );

		const gradient = paint( fill, { top: 10, bottom: 200 } );

		expect( gradient.span ).toEqual( [ 0, 10, 0, 200 ] );
		expect( gradient.stops ).toEqual( [
			[ 0, 'rgba(255, 0, 0, 0.28)' ],
			[ 0.6, 'rgba(255, 0, 0, 0.08)' ],
			[ 1, 'rgba(255, 0, 0, 0)' ],
		] );
	} );

	test( "a bar's fade: solid at the top, softer at its foot", () => {
		const fill = fadeDown( '#00ff00' );

		expect( paint( fill ) ).toBe( '#00ff00' );
		expect( paint( fill, { top: 0, bottom: 50 } ).stops ).toEqual( [
			[ 0, 'rgba(0, 255, 0, 1)' ],
			[ 1, 'rgba(0, 255, 0, 0.55)' ],
		] );
	} );

	test( 'a colour that is not hex is used as it is', () => {
		[ fadeDown, fadeUnder ].forEach( ( fade ) => {
			expect( fade( 'rgb(1, 2, 3)' ) ).toBe( 'rgb(1, 2, 3)' );
			expect( fade( undefined ) ).toBeUndefined();
		} );
	} );
} );

describe( 'styleDataset', () => {
	test( 'a line in a bar chart is styled as a line', () => {
		const line = styleDataset(
			{ type: 'line', borderColor: '#3858e9', data: [ 1 ] },
			'bar',
			0
		);

		expect( typeof line.backgroundColor ).toBe( 'function' );
		expect( line.pointRadius ).toBe( 0 );
		expect( line.borderRadius ).toBeUndefined();
		expect( line ).toMatchObject( {
			borderColor: '#3858e9',
			tension: 0.4,
			fill: true,
			borderWidth: 2.5,
			pointHoverRadius: 5,
			pointHoverBackgroundColor: '#fff',
			pointHoverBorderWidth: 2.5,
		} );
	} );

	test( 'a line keeps what it says, including nought and no fill', () => {
		const line = styleDataset(
			{
				tension: 0,
				fill: false,
				borderWidth: 0,
				pointRadius: 3,
				pointHoverRadius: 0,
				pointHoverBorderWidth: 0,
				backgroundColor: '#123456',
			},
			'line',
			1
		);

		expect( line ).toMatchObject( {
			borderColor: PALETTE[ 1 ],
			backgroundColor: '#123456',
			tension: 0,
			fill: false,
			borderWidth: 0,
			pointRadius: 3,
			pointHoverRadius: 0,
			pointHoverBorderWidth: 0,
		} );
	} );

	test( 'an area is a line', () => {
		expect( styleDataset( {}, 'area', 0 ).fill ).toBe( true );
	} );

	test( 'a bar with no colour fades down in the palette colour', () => {
		const bar = styleDataset( { data: [ 1 ] }, 'bar', 0, [ '#aa0000' ] );

		expect( typeof bar.backgroundColor ).toBe( 'function' );
		expect( paint( bar.backgroundColor ) ).toBe( '#aa0000' );
		expect( bar ).toMatchObject( {
			hoverBackgroundColor: '#aa0000',
			borderRadius: 8,
			borderSkipped: false,
			maxBarThickness: 64,
			categoryPercentage: 0.6,
		} );
	} );

	test( 'a colour per bar is kept, and is what each bar turns on hover', () => {
		const colours = [ '#ccd5fa', '#3858e9', '#ccd5fa' ];
		const bar = styleDataset(
			{ data: [ 1, 3, 2 ], backgroundColor: colours.slice() },
			'bar',
			0
		);

		expect( bar.backgroundColor ).toEqual( colours );
		expect( bar.hoverBackgroundColor ).toEqual( colours );
	} );

	test( 'a bar keeps what it says', () => {
		expect(
			styleDataset(
				{
					hoverBackgroundColor: '#000',
					borderRadius: 0,
					borderSkipped: 'start',
					maxBarThickness: 10,
					categoryPercentage: 1,
				},
				'bar',
				0
			)
		).toMatchObject( {
			hoverBackgroundColor: '#000',
			borderRadius: 0,
			borderSkipped: 'start',
			maxBarThickness: 10,
			categoryPercentage: 1,
		} );
	} );

	test( 'the palette goes round', () => {
		const palette = [ '#111111', '#222222' ];

		expect( styleDataset( {}, 'line', 2, palette ).borderColor ).toBe(
			'#111111'
		);
		expect( styleDataset( {}, 'line', 3, palette ).borderColor ).toBe(
			'#222222'
		);
	} );

	test( 'a pie is the palette, slice by slice, unless it says', () => {
		const palette = [ '#111111', '#222222' ];

		expect( styleDataset( {}, 'pie', 0, palette ).backgroundColor ).toBe(
			palette
		);
		expect(
			styleDataset( {}, 'doughnut', 0, palette ).backgroundColor
		).toBe( palette );
		expect(
			styleDataset( { backgroundColor: [ '#f00' ] }, 'pie', 0, palette )
				.backgroundColor
		).toEqual( [ '#f00' ] );
	} );

	test( 'another type is left alone', () => {
		expect( styleDataset( { data: [ 1 ] }, 'radar', 0 ) ).toEqual( {
			data: [ 1 ],
		} );
	} );
} );

describe( 'the options a chart is drawn with', () => {
	test( 'one series: no legend, no colour boxes', () => {
		const options = chartOptions( chartConfig() );

		expect( options.plugins.legend.display ).toBe( false );
		expect( options.plugins.tooltip.displayColors ).toBe( false );
		expect( options ).toMatchObject( {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
		} );
	} );

	test( 'two series: a legend', () => {
		const config = chartConfig();

		config.data.datasets.push( { data: [ 1 ] } );

		expect( chartOptions( config ).plugins.legend.display ).toBe( true );
		expect( chartOptions( config ).plugins.tooltip.displayColors ).toBe(
			true
		);
	} );

	test( "a chart's own options are laid over, deeply", () => {
		const options = chartOptions(
			chartConfig( {
				options: {
					plugins: { legend: { display: true, position: 'bottom' } },
				},
			} )
		);

		expect( options.plugins.legend ).toMatchObject( {
			display: true,
			position: 'bottom',
			align: 'end',
		} );
		expect( options.plugins.tooltip.padding ).toBe( 12 );
	} );

	test( 'a line or bar gets level, sparse axes; its own scales win', () => {
		[ 'line', 'bar' ].forEach( ( type ) => {
			const scales = chartOptions( chartConfig( { type } ) ).scales;

			expect( scales.x.ticks ).toMatchObject( {
				maxTicksLimit: 8,
				maxRotation: 0,
			} );
			expect( scales.y.beginAtZero ).toBe( true );
		} );

		const own = { y: { max: 10 } };

		expect(
			chartOptions( chartConfig( { options: { scales: own } } ) ).scales
		).toEqual( own );
	} );

	test( 'a pie has no axes', () => {
		expect(
			chartOptions( chartConfig( { type: 'pie' } ) ).scales
		).toBeUndefined();
	} );
} );

describe( 'an empty chart says so', () => {
	test( 'noughts, nothing and points of nought are empty', () => {
		const element = canvas();
		const box = element.parentElement;

		[
			{ datasets: [ { data: [ 0, 0 ] } ] },
			{ datasets: [ { data: [] } ] },
			{ datasets: [ {} ] },
			{ datasets: [ { data: [ { x: 1, y: 0 }, null, '0' ] } ] },
			{ datasets: [] },
			undefined,
		].forEach( ( values ) => {
			markEmptyChart( element, values, 'Nothing.' );

			expect(
				box.classList.contains( 'reports-chart-container--empty' )
			).toBe( true );
			expect( box.getAttribute( 'data-empty-text' ) ).toBe( 'Nothing.' );
		} );
	} );

	test( 'one figure anywhere is not empty', () => {
		const element = canvas();
		const box = element.parentElement;

		markEmptyChart(
			element,
			{ datasets: [ { data: [ 0 ] } ] },
			'Nothing.'
		);
		markEmptyChart(
			element,
			{ datasets: [ { data: [ 0 ] }, { data: [ { y: 2 } ] } ] },
			'Nothing.'
		);

		expect(
			box.classList.contains( 'reports-chart-container--empty' )
		).toBe( false );
		expect( box.hasAttribute( 'data-empty-text' ) ).toBe( false );
	} );

	test( 'a canvas outside a container is left alone', () => {
		const loose = document.createElement( 'canvas' );

		expect( () =>
			markEmptyChart( loose, { datasets: [] }, 'x' )
		).not.toThrow();
	} );
} );

describe( 'drawing', () => {
	test( "every canvas is drawn from its configuration, the server's kept", () => {
		const config = chartConfig( {
			options: { plugins: { legend: { display: true } } },
		} );

		canvas( config, 'sales' );
		canvas(
			chartConfig( {
				data: { labels: [], datasets: [ { data: [ 0 ] } ] },
			} ),
			'empty'
		);
		canvas( null, 'nothing' );

		const charts = createCharts( { Chart: FakeChart, t } );

		charts.init( document );

		expect( FakeChart.made ).toHaveLength( 2 );

		const [ drawn ] = FakeChart.made;

		expect( drawn.canvas ).toBe(
			document.querySelector( '[data-chart-id="sales"]' )
		);
		expect( drawn.config.type ).toBe( 'line' );
		expect( drawn.config.options.plugins.legend.display ).toBe( true );
		expect( typeof drawn.config.data.datasets[ 0 ].backgroundColor ).toBe(
			'function'
		);

		// The stored copy is the server's, unstyled.
		expect( charts.configs.sales ).toEqual( config );
		expect( charts.charts.sales ).toBe( drawn );

		expect(
			document
				.querySelector( '[data-chart-id="empty"]' )
				.parentElement.getAttribute( 'data-empty-text' )
		).toBe( STRINGS.noChartData );
	} );

	test( 'a chart drawn again replaces the one before', () => {
		const element = canvas();
		const charts = createCharts( { Chart: FakeChart, t } );

		charts.create( element, 'x', chartConfig() );
		charts.create( element, 'x', chartConfig() );

		expect( FakeChart.made[ 0 ].destroyed ).toBe( true );
		expect( FakeChart.made[ 1 ].destroyed ).toBe( false );
		expect( charts.charts.x ).toBe( FakeChart.made[ 1 ] );
	} );

	test( 'the palette from PHP colours the series', () => {
		canvas( chartConfig() );

		createCharts( { Chart: FakeChart, palette: [ '#abcdef' ], t } ).init(
			document
		);

		expect(
			FakeChart.made[ 0 ].config.data.datasets[ 0 ].borderColor
		).toBe( '#abcdef' );
	} );
} );

describe( 'a refresh draws what the new data says', () => {
	test( 'the new colours win, hover follows, the rest is kept', () => {
		const charts = createCharts( { Chart: FakeChart, t } );
		const chart = {
			data: { labels: [], datasets: [] },
			config: { type: 'bar' },
			canvas: canvas(),
			update: vi.fn(),
		};

		charts.charts.best = chart;
		charts.configs.best = {
			type: 'bar',
			data: {
				datasets: [
					{
						label: 'Sales',
						data: [ 3, 1 ],
						backgroundColor: [ '#111111', '#eeeeee' ],
						borderRadius: 2,
					},
				],
			},
		};

		charts.update( 'best', {
			labels: [ 'a', 'b' ],
			datasets: [
				{
					label: 'Sales',
					data: [ 1, 3 ],
					backgroundColor: [ '#eeeeee', '#111111' ],
				},
			],
		} );

		const [ dataset ] = chart.data.datasets;

		expect( chart.data.labels ).toEqual( [ 'a', 'b' ] );
		expect( dataset.backgroundColor ).toEqual( [ '#eeeeee', '#111111' ] );
		expect( dataset.hoverBackgroundColor ).toEqual( [
			'#eeeeee',
			'#111111',
		] );
		expect( dataset.borderRadius ).toBe( 2 );
		expect( dataset.data ).toEqual( [ 1, 3 ] );
		expect( chart.update ).toHaveBeenCalledWith( 'none' );

		// The page's copy is untouched for the next one.
		expect( charts.configs.best.data.datasets[ 0 ].data ).toEqual( [
			3, 1,
		] );
	} );

	test( "a series the page did not draw is styled by the chart's type", () => {
		const charts = createCharts( { Chart: FakeChart, t } );
		const chart = {
			data: {},
			config: { type: 'line' },
			canvas: canvas(),
			update: vi.fn(),
		};

		charts.charts.x = chart;
		charts.update( 'x', {
			labels: [ 'a' ],
			datasets: [ { data: [ 0 ] }, { data: [ 0 ] } ],
		} );

		expect( chart.data.datasets[ 1 ].borderColor ).toBe( PALETTE[ 1 ] );
		expect(
			chart.canvas.parentElement.classList.contains(
				'reports-chart-container--empty'
			)
		).toBe( true );
	} );

	test( "a refreshed series without values does not keep the page's", () => {
		const charts = createCharts( { Chart: FakeChart, t } );
		const chart = {
			data: {},
			config: { type: 'line' },
			canvas: canvas(),
			update: vi.fn(),
		};

		charts.charts.x = chart;
		charts.configs.x = {
			type: 'line',
			data: {
				datasets: [ { label: 'Old', data: [ 9, 9 ], tension: 0 } ],
			},
		};
		charts.update( 'x', { labels: [ 'a' ], datasets: [ {} ] } );

		expect( chart.data.datasets[ 0 ].data ).toBeUndefined();
		expect( chart.data.datasets[ 0 ].label ).toBeUndefined();
		expect( chart.data.datasets[ 0 ].tension ).toBe( 0 );
	} );

	test( 'nothing to draw, or no chart, changes nothing', () => {
		const charts = createCharts( { Chart: FakeChart, t } );
		const chart = {
			data: { labels: [ 'old' ] },
			config: { type: 'line' },
			canvas: canvas(),
			update: vi.fn(),
		};

		charts.charts.x = chart;
		charts.update( 'x', { datasets: [] } );
		charts.update( 'x', { labels: [] } );
		charts.update( 'missing', { labels: [], datasets: [] } );

		expect( chart.data.labels ).toEqual( [ 'old' ] );
		expect( chart.update ).not.toHaveBeenCalled();
	} );
} );

describe( 'sparklines', () => {
	const spark = ( points, direction = '' ) =>
		document.body.insertAdjacentHTML(
			'beforeend',
			`<canvas data-sparkline='${ points }' data-direction="${ direction }"></canvas>`
		);

	test( 'a shape, coloured by its direction, with nothing else', () => {
		spark( '[1,3,2]', 'up' );
		spark( '[3,2,1]', 'down' );
		spark( '[1,1]', 'neutral' );

		createCharts( { Chart: FakeChart, t } ).sparklines( document );

		expect(
			FakeChart.made.map(
				( c ) => c.config.data.datasets[ 0 ].borderColor
			)
		).toEqual( [ '#00a32a', '#d63638', '#787c82' ] );

		const [ first ] = FakeChart.made;

		expect( first.config.type ).toBe( 'line' );
		expect( first.config.data.labels ).toEqual( [ '', '', '' ] );
		expect( first.config.data.datasets[ 0 ] ).toMatchObject( {
			data: [ 1, 3, 2 ],
			borderWidth: 1.5,
			fill: false,
			pointRadius: 0,
			tension: 0.35,
		} );
		expect( first.config.options ).toMatchObject( {
			plugins: {
				legend: { display: false },
				tooltip: { enabled: false },
			},
			scales: { x: { display: false }, y: { display: false } },
			animation: false,
		} );
	} );

	test( 'fewer than two points, or not a list, is not drawn', () => {
		spark( '[1]' );
		spark( '{"a":1}' );
		spark( 'not json' );

		createCharts( { Chart: FakeChart, t } ).sparklines( document );

		expect( FakeChart.made ).toHaveLength( 0 );
	} );
} );
