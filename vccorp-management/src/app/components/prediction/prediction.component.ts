import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { API_URL } from '../../config';

interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  pr_auc: number;
}

interface CoordinatePoint {
  fpr?: number;
  tpr?: number;
  precision?: number;
  recall?: number;
}

interface ProbabilityBin {
  bin: string;
  count: number;
}

interface ProbabilityGroup {
  group: string;
  count: number;
  description: string;
}

interface ModelComparisonRecord {
  model: string;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  pr_auc: number;
}

interface PredictionResponse {
  model_selected: string;
  performance: PerformanceMetrics;
  roc_curve: CoordinatePoint[];
  pr_curve: CoordinatePoint[];
  probability_distribution: ProbabilityBin[];
  probability_groups: ProbabilityGroup[];
  comparison: ModelComparisonRecord[];
}

@Component({
  selector: 'app-prediction',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './prediction.component.html',
  styleUrl: './prediction.component.css'
})
export class PredictionComponent implements OnInit {
  modelSelected = signal<string>('Logistic Regression');
  performance = signal<PerformanceMetrics | null>(null);
  rocCurvePoints = signal<CoordinatePoint[]>([]);
  prCurvePoints = signal<CoordinatePoint[]>([]);
  probabilityDistribution = signal<ProbabilityBin[]>([]);
  probabilityGroups = signal<ProbabilityGroup[]>([]);
  comparisonList = signal<ModelComparisonRecord[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Active hover states
  activeTab = signal<'ROC' | 'PR'>('ROC');
  hoveredBinIndex = signal<number | null>(null);
  hoveredModelIndex = signal<number | null>(null);
  hoveredFeatureIndex = signal<number | null>(null);

  // New Enterprise Visualizations
  confusionMatrix = signal({
    tp: 2925,
    tn: 38091,
    fp: 18984,
    fn: 0,
    total: 60000
  });

  featureImportances = signal([
    { feature: 'Active Click Interaction', importance: 2.85, type: 'positive', color: '#059669', description: 'Strong positive: user active click interaction is the strongest driver of conversion.' },
    { feature: 'Prior Click Recency (Decay)', importance: 1.24, type: 'negative', color: '#DC2626', description: 'Strong negative: longer elapsed time since last click decays interest quickly.' },
    { feature: 'Premium Inventory Bid Cost', importance: 0.65, type: 'positive', color: '#059669', description: 'Moderate positive: higher cost bids secure premium higher-intent placements.' },
    { feature: 'Cold Traffic (Is First Click)', importance: 0.55, type: 'negative', color: '#DC2626', description: 'Moderate negative: cold traffic first clicks convert slower than retargeted clicks.' },
    { feature: 'Peak Conversion Hour', importance: 0.42, type: 'positive', color: '#059669', description: 'Slight positive: scheduling bids during high conversion activity hours improves CVR.' },
    { feature: 'Timeline Logs Day', importance: 0.12, type: 'positive', color: '#059669', description: 'Negligible positive: minor daily conversions variance over the 31-day period.' }
  ]);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<PredictionResponse>(`${API_URL}/api/prediction`).subscribe({
      next: (data) => {
        this.modelSelected.set(data.model_selected);
        this.performance.set(data.performance);
        this.rocCurvePoints.set(data.roc_curve);
        this.prCurvePoints.set(data.pr_curve);
        this.probabilityDistribution.set(data.probability_distribution);
        this.probabilityGroups.set(data.probability_groups);
        this.comparisonList.set(data.comparison);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load predictions:', err);
        this.error.set(`Failed to connect to backend server. Make sure API server is running on ${API_URL}`);
        this.loading.set(false);
      }
    });
  }

  // Helper formatting functions
  formatNumber(val: number): string {
    return val.toLocaleString();
  }

  // --- SVG Curve plotting ---
  curveChartWidth = 500;
  curveChartHeight = 220;
  curvePadding = 45;

  rocPath = computed(() => {
    const points = this.rocCurvePoints();
    const w = this.curveChartWidth - this.curvePadding * 2;
    const h = this.curveChartHeight - this.curvePadding * 2;

    if (points.length === 0) return '';

    return points.map((p, index) => {
      const fpr = p.fpr || 0;
      const tpr = p.tpr || 0;
      const x = this.curvePadding + fpr * w;
      const y = this.curveChartHeight - this.curvePadding - tpr * h;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  });

  rocAreaPath = computed(() => {
    const points = this.rocCurvePoints();
    const w = this.curveChartWidth - this.curvePadding * 2;
    const h = this.curveChartHeight - this.curvePadding * 2;
    const bottom = this.curveChartHeight - this.curvePadding;

    if (points.length === 0) return '';

    const lineCoords = points.map(p => {
      const fpr = p.fpr || 0;
      const tpr = p.tpr || 0;
      const x = this.curvePadding + fpr * w;
      const y = this.curveChartHeight - this.curvePadding - tpr * h;
      return `${x} ${y}`;
    }).join(' L ');

    return `M ${this.curvePadding} ${bottom} L ${lineCoords} L ${this.curvePadding + w} ${bottom} Z`;
  });

  prPath = computed(() => {
    const points = this.prCurvePoints();
    const w = this.curveChartWidth - this.curvePadding * 2;
    const h = this.curveChartHeight - this.curvePadding * 2;

    if (points.length === 0) return '';

    return points.map((p, index) => {
      const recall = p.recall || 0;
      const precision = p.precision || 0;
      const x = this.curvePadding + recall * w;
      const y = this.curveChartHeight - this.curvePadding - precision * h;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  });

  prAreaPath = computed(() => {
    const points = this.prCurvePoints();
    const w = this.curveChartWidth - this.curvePadding * 2;
    const h = this.curveChartHeight - this.curvePadding * 2;
    const bottom = this.curveChartHeight - this.curvePadding;

    if (points.length === 0) return '';

    const lineCoords = points.map(p => {
      const recall = p.recall || 0;
      const precision = p.precision || 0;
      const x = this.curvePadding + recall * w;
      const y = this.curveChartHeight - this.curvePadding - precision * h;
      return `${x} ${y}`;
    }).join(' L ');

    return `M ${this.curvePadding} ${bottom} L ${lineCoords} L ${this.curvePadding + w} ${bottom} Z`;
  });

  // --- SVG Histogram (Probability Deciles) ---
  histChartWidth = 500;
  histChartHeight = 220;
  histPadding = 40;

  maxHistCount = computed(() => {
    const bins = this.probabilityDistribution();
    if (bins.length === 0) return 1;
    return Math.max(...bins.map(b => b.count));
  });

  histBars = computed(() => {
    const bins = this.probabilityDistribution();
    const maxCount = this.maxHistCount();
    const w = this.histChartWidth - this.histPadding * 2;
    const h = this.histChartHeight - this.histPadding * 2;

    if (bins.length === 0) return [];

    const barWidth = (w / bins.length) * 0.65;
    const barGap = (w / bins.length) * 0.35;

    return bins.map((b, index) => {
      const barHeight = (b.count / maxCount) * h;
      const x = this.histPadding + index * (barWidth + barGap);
      const y = this.histChartHeight - this.histPadding - barHeight;

      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        record: b,
        index
      };
    });
  });

  // --- SVG Grouped Comparison Chart ---
  compChartWidth = 500;
  compChartHeight = 220;
  compPadding = 40;

  compBars = computed(() => {
    const models = this.comparisonList();
    const w = this.compChartWidth - this.compPadding * 2;
    const h = this.compChartHeight - this.compPadding * 2;

    if (models.length === 0) return [];

    const groupWidth = w / models.length;
    const barWidth = groupWidth * 0.2; // 3 bars per group (PR-AUC, F1, ROC-AUC)
    const barGap = 4;

    return models.map((model, index) => {
      const groupX = this.compPadding + index * groupWidth;
      
      const prHeight = model.pr_auc * h;
      const f1Height = model.f1_score * h;
      const aucHeight = model.roc_auc * h;

      return {
        model: model.model,
        index,
        metrics: [
          { name: 'PR-AUC', x: groupX + groupWidth*0.1, y: this.compChartHeight - this.compPadding - prHeight, w: barWidth, h: prHeight, color: '#3b82f6', value: (model.pr_auc*100).toFixed(1) + '%' },
          { name: 'F1-Score', x: groupX + groupWidth*0.1 + barWidth + barGap, y: this.compChartHeight - this.compPadding - f1Height, w: barWidth, h: f1Height, color: '#ec4899', value: (model.f1_score*100).toFixed(1) + '%' },
          { name: 'ROC-AUC', x: groupX + groupWidth*0.1 + (barWidth + barGap)*2, y: this.compChartHeight - this.compPadding - aucHeight, w: barWidth, h: aucHeight, color: '#10b981', value: (model.roc_auc*100).toFixed(1) + '%' }
        ]
      };
    });
  });
}
