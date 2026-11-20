# Reports

An analytics screen for a WordPress plugin — tiles, charts, funnels, tables
and a date range — from a description of what to show.

## What it does

A reports page is the same furniture every time: a date-range control, tabs,
filters, a row of headline figures, some charts and a table or two, all
reloading together when the range changes.

None of that is the interesting part. This builds it, and asks you only for
the callbacks that fetch the numbers.

## Features

* Get a reports screen with a date-range picker and comparison periods
* Show headline figures as tiles, with the change against the previous period
* Add line, bar and pie charts without touching a charting library
* Draw money, counts on a second axis, bars and a line together, with a figure and a sentence above
* Show a funnel: steps side by side, with how many carried on from each
* Put a sentence across a tab that takes no room when it has nothing to say
* Add a data table, sortable and paged, beside them
* Say so in a line when a breakdown or stat list has nothing in it (`empty_message`, default "No data available"), never a title over an empty card
* Group everything into tabs, each with its own filters
* Refresh in place when the range or a filter changes, without a page load
* Offer a CSV export of what is on screen, batched so it does not time out
* Let each person hide the components they do not read, per tab, from Screen Options

## Installation

```bash
composer require sugarcommerce/reports
```

## Quick start

```php
use SugarCommerce\Reports\Reports;

Reports::register( 'my-analytics', [
	'page_title'  => __( 'Analytics', 'my-plugin' ),
	'menu_title'  => __( 'Analytics', 'my-plugin' ),
	'parent_slug' => 'tools.php',

	'tabs'        => [
		'overview' => [ 'label' => __( 'Overview', 'my-plugin' ) ],
	],

	'components'  => [
		'revenue' => [
			'type'          => 'tile',
			'tab'           => 'overview',
			'title'         => __( 'Revenue', 'my-plugin' ),
			'value_format'  => 'currency',
			'data_callback' => '\MyPlugin\get_revenue',
		],
	],
] );
```

`data_callback` is handed the date range and the active filters, and returns
a number. The tile, its formatting and the comparison against the previous
period are not yours to build.

## Charts

A chart's `data_callback` returns `labels` and `datasets`, as Chart.js has
them. `Datasets` builds the datasets the way the report draws them, and the
keys on the component build the options:

```php
use SugarCommerce\Reports\Datasets;

'sales' => [
	'type'           => 'chart',
	'tab'            => 'overview',
	'title'          => __( 'Net revenue', 'my-plugin' ),
	'height'         => 280,
	'value_format'   => 'currency',             // Money up the side and in the tooltip.
	'currency'       => 'GBP',
	'secondary_axis' => true,                   // A count on the right, for datasets with yAxisID y1.
	'show_period'    => false,                  // No "— Last 30 days" after the title.
	'headline'       => 'my_plugin_sales_headline', // [ 'value' => '£1,204', 'change' => '12% vs previous period', 'direction' => 'up' ]
	'caption'        => 'my_plugin_sales_caption',  // A sentence under the figure.
	'data_callback'  => function ( array $range ): array {
		$series = my_plugin_sales_series( $range );

		return [
			'labels'   => $series['labels'],
			'datasets' => [
				Datasets::line( __( 'Net revenue', 'my-plugin' ), Datasets::so_far( $series['net'], $series['starts'] ), '#3858e9' ),
				Datasets::line( __( 'Orders', 'my-plugin' ), Datasets::so_far( $series['orders'], $series['starts'] ), '#9aa0a6', [ 'yAxisID' => 'y1' ] ),
			],
		];
	},
],
```

Two lines over each other each fade from their own colour. The legend is
drawn for two series and not for one, and always for a pie or a doughnut,
whose legend names the slices (`show_legend`: `auto`, `true` or `false`).

* `value_format` is `currency` (with `currency`, formatted by the browser,
  which knows a yen has no pence) or `integer`; anything else is a plain
  number. Chart values are amounts as they are read -- 49.99, not 4999.
  A tile's money is the other way round: minor units (4999), or a decimal
  amount written with its point (`'49.99'`, as `$wpdb` hands back a DECIMAL
  column), read in the currency's own places, so `'99.00'` yen is ¥99.
* `secondary_axis` is `true` for a count, or `[ 'value_format' => ..., 'label' => ... ]`.
* `headline` and `caption` are values or callables handed the range and the
  component. A caption replaces `description` when it has something to say.
* `chart_type` may be `auto`: bars for up to `bars_max` buckets (12), a line
  for more. A first dataset that names its own `type` decides the chart
  instead, which is how `Datasets::over_time()` makes the choice and how
  bars and a line are drawn together.
* `options` is laid over everything the keys built, keyed arrays merged and
  lists replaced, so any Chart.js option is one key away:
  `'options' => [ 'scales' => [ 'y' => [ 'max' => 100 ] ] ]`.

`Datasets`:

| Method | What it returns |
|---|---|
| `line( $label, $data, $colour = '', $extra = [] )` | A monotone line; the script fades the area under it from `$colour`. |
| `bars( $label, $data, $colour = '', $extra = [] )` | Bars, in one colour or a colour per bar. |
| `highlight( $data, $colour, $tint )` | A colour per bar: the tallest in `$colour`, the rest in `$tint`, all `$tint` when every bar is nought. |
| `over_time( $label, $data, [ 'colour', 'bars_max', 'starts', 'now' ] )` | Bars while they can be counted, a line once there are more. |
| `so_far( $data, $starts, $now = null )` | The values with buckets that have not started set to null, so a line stops at today rather than falling to the floor. |

A colour given per bar keeps its colour under the pointer, and a refresh
draws the colours the new data gives: the best bar this time, not last
time's.

## Funnels

How many of those who started something went on to finish it: baskets to
orders, sign-ups to paid.

```php
'basket_to_order' => [
	'type'          => 'funnel',
	'tab'           => 'overview',
	'title'         => __( 'From basket to order', 'my-plugin' ),
	'width'         => 'full',
	'colour'        => '#3858e9', // The bars; the admin colour scheme's otherwise.
	'data_callback' => function ( array $range ): array {
		return [
			'steps'       => [
				[ 'label' => __( 'Baskets', 'my-plugin' ), 'count' => 200 ],
				[ 'label' => __( 'Checkouts', 'my-plugin' ), 'count' => 50, 'next' => __( '%s were paid for', 'my-plugin' ) ],
				[ 'label' => __( 'Orders', 'my-plugin' ), 'count' => 40 ],
			],
			'headline'    => [ 'value' => '20%', 'change' => '3% vs previous period', 'direction' => 'up' ],
			'description' => __( 'Of 200 baskets, 40 were paid for.', 'my-plugin' ),
			'foot'        => [ __( '12 left at checkout', 'my-plugin' ), __( 'Average basket £30', 'my-plugin' ) ],
		];
	},
],
```

Each step is a bar against the first, and under it the share that reached
the next: in its own words with `note`, as a format with `next` ("%s were
paid for"), or "62% continued". The last step says nothing unless it has a
`note`. Without a `headline` the figure is the whole way through, last
step over first. The callback may return just the list of steps.

A funnel whose first step is nought, or that has no steps, draws nothing:
a card of noughts would tell a shop with no baskets it had lost every sale.
It is drawn with the page and not refreshed in place.

## Notes and HTML

An `html` component prints `content` -- markup, or a callable handed the
range and the component -- or whatever its `render_callback` prints.

```php
'when_to_post' => [
	'type'            => 'html',
	'tab'             => 'timing',
	'title'           => '',
	'width'           => 'full',
	'appearance'      => 'note',  // A sentence in a card of its own.
	'markup'          => false,   // Plain text, escaped. Markup goes through wp_kses_post().
	'hide_when_empty' => true,    // Nothing to say, no room taken.
	'content'         => fn( array $range ): string => my_plugin_best_hour_sentence( $range ),
],
```

`hide_when_empty` is off by default, because an empty box is also what a
script fills in later. A component with `ajax_refresh` false is left out of
the in-place refresh.

## Exports of many rows

An export is written a batch at a time, each batch its own request: 1,000
rows (`RestApi::BATCH_SIZE`), or the export's own `batch_size`. Its
`data_callback` is handed the period, the filters, `limit` and `offset` --
and `after`, the cursor the previous batch answered, when it answered one.
Read by `offset`, the hundredth batch counts its way past 99,000 rows
first; read by key, every batch costs the same.

```php
'data_callback' => function ( array $args ): array {
	$rows = my_plugin_orders(
		[
			'id_after' => $args['after'] ?? 0, // null on the first batch.
			'number'   => $args['limit'],
		]
	);

	// Plain rows are paged by offset, as before.
	return [
		'rows'   => $rows,
		'cursor' => [] === $rows ? null : end( $rows )['id'],
	];
},
```

## Built only when it is needed

A report is registered on every request, because its figures arrive over
REST. When its tabs or filters cost something to work out -- a product
filter listing what has sold, a country filter, a tab shown only to a shop
that has subscriptions -- hand those over as `build`, and keep only the menu
settings in the array:

```php
Reports::register( 'my-analytics', [
	'page_title'  => __( 'Analytics', 'my-plugin' ),
	'menu_title'  => __( 'Analytics', 'my-plugin' ),
	'parent_slug' => 'tools.php',
	'capability'  => 'manage_options',
	'build'       => fn(): array => [
		'tabs'       => my_plugin_report_tabs(),
		'filters'    => my_plugin_report_filters(),
		'components' => my_plugin_report_components(),
	],
] );
```

The callback runs once, the first time anything asks about the report's
contents: the page itself, one of its REST routes, `get_tabs()`,
`get_config()`. The admin menu is drawn from the array, so the other screens
never run it. What it returns is merged over the array, and the
`sugarcommerce_reports_register` filter sees the two together, when it runs.
`add_tab()`, `add_component()` and `add_export()` called before then are kept
and applied on top of it. `is_built()` says whether it has run.

## Whose days: UTC or the site's

A date range reaches every `data_callback` as `start` and `end` in UTC, for a
column that stores UTC. Where "today" starts is a separate question, and by
default it is midnight UTC. A report whose days should be the site's says so:

```php
Reports::register( 'my-analytics', [
	'timezone'    => 'site',  // 'utc' (default), 'site', or a DateTimeZone
	'week_starts' => null,    // 0 Sunday to 6 Saturday; null is Monday for
	                          // 'utc' and the site's own setting otherwise
] );
```

With `'site'`, Today is the site's midnight to its next midnight -- 23 or 25
hours on the day the clocks change -- two picked dates are the site's days,
and This Week starts on the day set under Settings > General. The page, the
REST refresh and the exports all resolve a period through
`Reports::resolve_range()`, so they agree.

## Layout: tabs or a sidebar

The sections of a report are tabs across the top while there are few of
them, and a list down the left once there are many. Nothing has to be set:
the report counts its tabs.

```php
Reports::register( 'my-analytics', [
	'layout'        => 'auto',   // 'auto', 'tabs' or 'sidebar'
	'sidebar_after' => 6,        // 'auto' is a sidebar above this many tabs

	'tabs'          => [
		'overview' => [ 'label' => __( 'Overview', 'my-plugin' ), 'icon' => 'heroicons-outline:chart-bar' ],
		'export'   => [ 'label' => __( 'Export', 'my-plugin' ), 'position' => 100 ],
		'payouts'  => [
			'label'    => __( 'Payouts', 'my-plugin' ),
			'icon'     => 'dashicons-bank',
			'group'    => __( 'Add-ons', 'my-plugin' ),
			'position' => 60,
		],
	],
] );
```

* `position` orders the tabs in either layout. Tabs that name none sit at
  10, 20, 30 and so on in the order they were written, so there is room
  between any two.
* `group` is a heading in the sidebar. Tabs without one are listed first,
  then each group under its heading. The tab bar has no headings and ignores
  it, and in the sidebar's row of links on a phone a group is set off by a
  thin rule (the heading stays its name for a screen reader).
* `icon` is drawn in the sidebar and not on a tab, as in WordPress itself.
  Either form in [Icons](#icons): `heroicons-outline:chart-bar` or
  `dashicons-bank`.

The body carries `reports-layout--tabs` or `reports-layout--sidebar`. Below
782px the sidebar becomes a single row of links above the report that
scrolls sideways, and the tab bar scrolls the same way when its tabs do not
fit, so neither wraps onto a second line.

## Icons

Everywhere a report takes an `icon`, it takes one of two forms:

* `set:name`, from the icon sets of `sugarcommerce/fields` -- `heroicons-outline:key`,
  `heroicons-solid:star`, `wordpress:...` -- drawn as inline SVG in the colour
  of the text around it. The Heroicons names are the ones on heroicons.com.
* A Dashicons name, `admin-network` or `dashicons-admin-network`, drawn as the
  Dashicons span it always was. A report written before there were icon sets
  looks as it did.

Either way the element carries the class `sugarcommerce-icon`, which is what
the stylesheet sizes. A value that is neither -- a typo, an icon no set has --
draws nothing.

```php
'tabs'       => [
	'licenses' => [ 'label' => __( 'Licences', 'my-plugin' ), 'icon' => 'heroicons-outline:key' ],
	'products' => [ 'label' => __( 'Products', 'my-plugin' ), 'icon' => 'dashicons-products' ],
],
'components' => [
	'issued'    => [
		'type'          => 'tile',
		'tab'           => 'licenses',
		'title'         => __( 'Licences issued', 'my-plugin' ),
		'icon'          => 'heroicons-outline:key',
		'icon_color'    => 'blue',
		'data_callback' => 'my_plugin_licences_issued',
	],
	'countries' => [
		'type'          => 'breakdown',
		'tab'           => 'licenses',
		'title'         => __( 'Activations by country', 'my-plugin' ),
		'data_callback' => static fn(): array => [
			'rows' => [
				[ 'label' => 'Japan', 'value' => 12, 'icon' => 'https://example.com/flags/jp.svg' ],
				[ 'label' => 'Elsewhere', 'value' => 3, 'icon' => 'heroicons-outline:globe-alt' ],
			],
		],
	],
],
```

* A tab's `icon` is drawn in the sidebar.
* A tile's `icon` defaults to `heroicons-outline:chart-bar`. The stylesheet
  keeps a tile's icon box hidden -- a tile is a number and its change -- so
  it is there for a stylesheet that shows it.
* A breakdown or stat list row's `icon` is a picture's URL (a flag, a
  thumbnail) or a `set:name` icon, drawn at 16px before the label. A bare
  word there is a relative URL, not a Dashicon.
* The library's own -- the arrow beside a change, the caret on the date
  picker, the calendar under the exports and the empty screen's chart -- are
  Heroicons outline.
* The report's own `icon`, for a top-level menu entry, is passed to
  `add_menu_page()` and so takes what core takes: a Dashicons class
  (default `dashicons-chart-area`), a URL or a base64 SVG.

## Adding to a report from another plugin

Three ways, depending on when your code runs.

Before the report is registered, filter its configuration. The hook is
`sugarcommerce_reports_register` for a plain Composer install; in a copy
prefixed by Strauss it carries the prefix
(`myplugin_sugarcommerce_reports_register`), and `Runtime::hook( 'register' )`
gives the name either way. A prefix that itself starts `SugarCommerce\` keeps
all its segments -- `SugarCommerce\Playground\Vendor\` gives
`sugarcommerce_playground_vendor_sugarcommerce_reports_register` -- so a
plugin of the family is never taken for an unprefixed copy.

```php
add_filter( 'sugarcommerce_reports_register', function ( array $config, string $id ): array {
	if ( 'my-analytics' === $id ) {
		$config['tabs']['payouts']        = [ 'label' => 'Payouts', 'group' => 'Add-ons' ];
		$config['components']['paid_out'] = [
			'type'          => 'tile',
			'tab'           => 'payouts',
			'title'         => 'Paid out',
			'data_callback' => 'my_addon_paid_out',
		];
	}

	return $config;
}, 10, 2 );
```

After it is registered, add to the report itself:

```php
add_action( 'init', function (): void {
	$report = Reports::get( 'my-analytics' );

	if ( $report ) {
		$report
			->add_tab( 'payouts', [ 'label' => 'Payouts', 'position' => 60 ] )
			->add_component( 'paid_out', [ 'type' => 'tile', 'tab' => 'payouts', 'data_callback' => 'my_addon_paid_out' ] )
			->add_export( 'payouts', [ 'tab' => 'payouts', 'data_callback' => 'my_addon_payout_rows', 'total_callback' => 'my_addon_payout_count' ] );
	}
}, 20 );
```

Either way, do it on every request and not only in the admin: the figures
are fetched over REST, and a component added only where the page is drawn is
one the REST request has never heard of.

A component of a type the library does not have is drawn by a filter,
`sugarcommerce_reports_render_component` (prefixed the same way): return true from it once
you have printed the component.

## The scripts

Plain JavaScript in ES modules (`assets/js`), each with one job, built by
`@wordpress/scripts` into `assets/build` -- one file, `reports.js`, with a
`reports.asset.php` naming the WordPress scripts it imports (`wp-api-fetch`,
`wp-dom-ready`) and a version that changes with its contents.
`Traits\AssetManager` loads it on the report's own screen with
`SugarCommerce\Plugin\Assets::enqueue_built_script()`, under the copy's
handle (`Runtime::handle()`), in the footer. No jQuery.

Chart.js 4.6.1 (MIT, <https://www.chartjs.org>, with its `@kurkle/color`,
also MIT) is bundled into that file from the `chart.js` package, every chart
type, scale and plugin registered (`chart.js/auto`) as the vendored copy it
replaces had them. It is no longer a script of its own, so there is no
`…-chartjs` handle and no `window.Chart`.

| Module | Its job |
|---|---|
| `reports.js` | The entry: reads the settings, starts the report once the page is ready |
| `reports/init` | Puts it together, in the order the page always did it |
| `reports/page` | Stray notices gathered under the header; the current section scrolled into view in a row that scrolls |
| `reports/date-picker` | The presets, the custom range, closing on a click elsewhere |
| `reports/filters` | Filter forms with nothing to type into submit on a choice (`reports-filter-form--auto`) |
| `reports/location` | The tab, period and `filter_*` arguments read from the address, and a new period written into it |
| `reports/refresh` | Refresh, the report's own interval (paused while the page is out of view), "Updated 2m ago" |
| `reports/components` | Tiles, progress bars, breakdowns and stat lists drawn again from a refresh |
| `reports/charts/charts`, `charts/style` | Charts drawn from `data-chart-config` and again from a refresh; sparklines; the report's look for a dataset that says nothing |
| `reports/tables/rows`, `tables/paging`, `tables/sort` | A table's rows drawn again, its pages and buttons, sorting by a heading |
| `reports/exports` | A CSV export started, written batch by batch, downloaded |
| `reports/screen-options` | A component hidden the moment its box is unticked, the choice saved |
| `lib/config` | The one reader of what PHP printed |
| `lib/rest` | Every request, through `@wordpress/api-fetch` |
| `lib/query`, `lib/merge`, `lib/data`, `lib/dom` | What jQuery did and the page relies on: `$.param()`'s query string, `$.extend( true )`'s merge of a chart's own options, `.data()`'s reading of `data-*` attributes, `show()`/`hide()`/`toggle()` -- each checked against jQuery 3.7 in the tests |
| `lib/text` | The words PHP handed over, with their `%1$d` and `%s` filled in |

What other code may rely on is unchanged:

* the handle, `Runtime::handle()`, and its settings published both ways they
  were: `window.SugarCommerceReports[ handle ]`, which the script finds from
  the id WordPress stamps on its tag, and the localized
  `Runtime::js_object( 'Admin' )` (`SugarcommerceReportsAdmin` unprefixed);
* every request: the refresh's GET to `components` with `report_id`, `tab`,
  `date_preset`, `date_start`, `date_end` and the `filter_*` arguments
  (a multiselect as repeated `filter_x[]`), the JSON posted to
  `screen-options`, `export/start` and `export/batch`, each with
  `X-WP-Nonce`;
* every class and data attribute the PHP draws or the stylesheet styles,
  and the ones the script adds (`refreshing updating-message`,
  `reports-component-refreshing`, `reports-chart-container--empty` with
  `data-empty-text`, `sorted-asc`/`sorted-desc`, `reports-filter-form--busy`).

`window.ReportsController`, which the old script set and nothing read, is
gone; so is its fallback to `$.ajax` on a page without `wp.apiFetch`, which
the build now brings.

```bash
npm ci
npm run build      # assets/build, committed
npm run start      # rebuild on change
npm run test:js    # Vitest, in jsdom (composer test:js runs it too)
npm run lint:js
```

The build's files are what ship, with the sources beside them. CI builds
again and fails when the result differs from what was committed.

## Security

* Reading what you may not: every route asks the report's capability, and
  an export batch or download the capability of the report its session
  names, not of one the request names.
* Someone else's export: an export session belongs to the user who started
  it, so a download link found in a log or a browser's history is refused to
  anyone else.
* Leaking internals: a data callback that throws answers "The report could
  not be read"; its message is shown only under `WP_DEBUG` with
  `WP_DEBUG_DISPLAY`.
* Spreadsheet formulas in an export: every CSV cell is written through
  `SugarCommerce\Text\Csv`, which defuses a leading `=`, `+`, `-`, `@`.
* A file outside the exports folder: a download is read only when its path
  resolves inside the report's own export directory, which is denied to the
  web.
* Markup in a cell: cells are formatted and `wp_kses_post()`ed on the server
  for the page and the refresh alike; an action's `{placeholders}` are
  URL-encoded.

## Source layout

* `src/Reports.php`: one report screen; its jobs are traits in
  `src/Traits/Reports/` (config, tabs, menus, the date range, screen
  options, the page, components and their renderers, exports).
* `src/RestApi.php`: the routes and the checks they share, with
  `src/Traits/RestApi/` (routes, permissions, component data, exports,
  preferences).
* `src/Registry.php`, `Datasets.php` (series for charts), `Format.php`, and
  `src/Utils/Runtime.php` (hook, handle and route names).
* `src/` is PHP only. The script's sources are in `assets/js/`, built to
  `assets/build/`; the styles are in `assets/css/`.

## Requirements

* PHP 8.3 or later
* WordPress 7.1 or later

The script's refreshes, exports and screen options go through `wp.apiFetch`
(which the build imports), so a report left open past its nonce's life,
refreshing itself, renews the nonce and tries again instead of answering 403.

## License

GPL-2.0-or-later
