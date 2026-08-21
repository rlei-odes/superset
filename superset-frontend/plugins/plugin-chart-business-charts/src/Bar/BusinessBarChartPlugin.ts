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
import {
  EchartsChartPlugin,
  EchartsTimeseriesChartProps,
  EchartsTimeseriesFormData,
} from '@superset-ui/plugin-chart-echarts';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import { stockBarPlugin } from './stockBar';

export default class BusinessBarChartPlugin extends EchartsChartPlugin<
  EchartsTimeseriesFormData,
  EchartsTimeseriesChartProps
> {
  constructor() {
    super({
      loadBuildQuery: stockBarPlugin.loadBuildQuery,
      controlPanel,
      loadChart: stockBarPlugin.loadChart,
      metadata: {
        behaviors: [
          Behavior.InteractiveChart,
          Behavior.DrillToDetail,
          Behavior.DrillBy,
        ],
        category: t('Evolution'),
        credits: ['https://echarts.apache.org'],
        description: t(
          'Bar chart where each series can be assigned a business role ' +
            '(Actual, Plan, Forecast, Prior Year) that maps to a consistent ' +
            'visual treatment, independent of colour-scheme cycling.',
        ),
        supportedAnnotationTypes: [
          AnnotationType.Event,
          AnnotationType.Formula,
          AnnotationType.Interval,
          AnnotationType.Timeseries,
        ],
        name: t('Business Bar Chart'),
        tags: [t('ECharts'), t('Bar'), t('Time'), t('Business')],
        // Placeholder art borrowed from the stock Bar chart, until this chart
        // renders something distinct enough to be worth capturing.
        thumbnail: stockBarPlugin.metadata.thumbnail,
        thumbnailDark: stockBarPlugin.metadata.thumbnailDark,
      },
      transformProps,
    });
  }
}
