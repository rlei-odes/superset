/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { t } from '@apache-superset/core/translation';
import { AnnotationType, Behavior } from '@superset-ui/core';
import { EchartsChartPlugin } from '@superset-ui/plugin-chart-echarts';
import controlPanel from './controlPanel';
import transformProps, { BusinessMixedChartProps } from './transformProps';
import { stockMixedPlugin } from './stockMixed';

export default class BusinessMixedChartPlugin extends EchartsChartPlugin<
  BusinessMixedChartProps['formData'],
  BusinessMixedChartProps
> {
  constructor() {
    super({
      loadBuildQuery: stockMixedPlugin.loadBuildQuery,
      controlPanel,
      loadChart: stockMixedPlugin.loadChart,
      metadata: {
        behaviors: [
          Behavior.InteractiveChart,
          Behavior.DrillToDetail,
          Behavior.DrillBy,
        ],
        category: t('Evolution'),
        credits: ['https://echarts.apache.org'],
        description: t(
          'Two series on one x-axis, each drawn as bars or as a line, where ' +
            'every series can be assigned a business role (Actual, Plan, ' +
            'Forecast, Prior Year) that maps to a consistent visual ' +
            'treatment. Bars are filled solid, hollow or hatched and lines ' +
            'are stroked solid, dashed or dotted to match, so a metric shown ' +
            'as both a periodic bar and a cumulative line reads as one role.',
        ),
        supportedAnnotationTypes: [
          AnnotationType.Event,
          AnnotationType.Formula,
          AnnotationType.Interval,
          AnnotationType.Timeseries,
        ],
        name: t('Business Mixed Chart'),
        tags: [
          t('ECharts'),
          t('Bar'),
          t('Line'),
          t('Multi-Variables'),
          t('Time'),
          t('Business'),
        ],
        // Without this the second query is never submitted, and the chart is a
        // more elaborate way of drawing query A.
        queryObjectCount: 2,
        // Placeholder art borrowed from the stock Mixed chart, until this chart
        // renders something distinct enough to be worth capturing.
        thumbnail: stockMixedPlugin.metadata.thumbnail,
        thumbnailDark: stockMixedPlugin.metadata.thumbnailDark,
      },
      transformProps,
    });
  }
}
