import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { API_URL } from '../../config';

interface FunnelStage {
  stage: string;
  count: number;
  percentage: number;
  dropOff: number;
}

interface JourneyType {
  type: string;
  count: number;
  percentage: number;
  color: string;
  description: string;
}

interface JourneyDepthGroup {
  depth: string;
  conversions: number;
  percentage: number;
  description: string;
}

interface TimeIntervalRecord {
  interval: string;
  count: number;
  conversions: number;
  rate: number;
}

interface JourneyResponse {
  funnel: FunnelStage[];
  journeyTypes: JourneyType[];
  journeyDepthGroups: JourneyDepthGroup[];
  timeSinceLastClick: TimeIntervalRecord[];
}

@Component({
  selector: 'app-journey',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './journey.component.html',
  styleUrl: './journey.component.css'
})
export class JourneyComponent implements OnInit {
  funnel = signal<FunnelStage[]>([]);
  journeyTypes = signal<JourneyType[]>([]);
  journeyDepthGroups = signal<JourneyDepthGroup[]>([]);
  timeSinceLastClick = signal<TimeIntervalRecord[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Interactivity signals
  hoveredDepthIndex = signal<number | null>(null);
  hoveredTimeIndex = signal<number | null>(null);
  hoveredTypeIndex = signal<number | null>(null);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<JourneyResponse>(`${API_URL}/api/journey`).subscribe({
      next: (data) => {
        this.funnel.set(data.funnel);
        this.journeyTypes.set(data.journeyTypes);
        this.journeyDepthGroups.set(data.journeyDepthGroups);
        this.timeSinceLastClick.set(data.timeSinceLastClick);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load journey stats:', err);
        this.error.set(`Failed to connect to backend server. Make sure API server is running on ${API_URL}`);
        this.loading.set(false);
      }
    });
  }

  // Formatting utility
  formatNumber(val: number): string {
    return val.toLocaleString();
  }

  // --- SVG Donut Ring Calculations ---
  donutRadius = 70;
  donutCircumference = 2 * Math.PI * this.donutRadius; // 439.82

  donutSlices = computed(() => {
    const types = this.journeyTypes();
    let accumulatedPercentage = 0;
    
    return types.map(t => {
      const strokeDashArray = `${this.donutCircumference} ${this.donutCircumference}`;
      
      // Dashoffset = Circumference - (Percentage / 100 * Circumference)
      const strokeDashOffset = this.donutCircumference - (t.percentage / 100) * this.donutCircumference;
      
      // Calculate rotation based on accumulated percentages
      const rotation = (accumulatedPercentage / 100) * 360;
      accumulatedPercentage += t.percentage;
      
      return {
        type: t,
        strokeDashArray,
        strokeDashOffset,
        rotation
      };
    });
  });

  // --- SVG Bar Chart for Depth ---
  depthChartWidth = 700;
  depthChartHeight = 220;
  depthPadding = 40;

  maxDepthConversions = computed(() => {
    const list = this.journeyDepthGroups();
    if (list.length === 0) return 1;
    return Math.max(...list.map(d => d.conversions));
  });

  depthBars = computed(() => {
    const list = this.journeyDepthGroups();
    const maxVal = this.maxDepthConversions();
    const w = this.depthChartWidth - this.depthPadding * 2;
    const h = this.depthChartHeight - this.depthPadding * 2;

    if (list.length === 0) return [];

    const barWidth = (w / list.length) * 0.6;
    const barGap = (w / list.length) * 0.4;

    return list.map((d, index) => {
      const barHeight = (d.conversions / maxVal) * h;
      const x = this.depthPadding + index * (barWidth + barGap);
      const y = this.depthChartHeight - this.depthPadding - barHeight;

      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        record: d,
        index
      };
    });
  });

  // --- SVG Line Chart for CVR Decay by Time ---
  decayChartWidth = 700;
  decayChartHeight = 220;
  decayPadding = 40;

  maxDecayCvr = computed(() => {
    const list = this.timeSinceLastClick();
    if (list.length === 0) return 1;
    return Math.max(...list.map(t => t.rate));
  });

  decayCoordinates = computed(() => {
    const list = this.timeSinceLastClick();
    const maxRate = this.maxDecayCvr();
    const w = this.decayChartWidth - this.decayPadding * 2;
    const h = this.decayChartHeight - this.decayPadding * 2;

    if (list.length === 0) return [];

    return list.map((record, index) => {
      const x = this.decayPadding + (index / (list.length - 1)) * w;
      const y = this.decayChartHeight - this.decayPadding - (record.rate / maxRate) * h;
      return { x, y, record, index };
    });
  });

  decayLinePath = computed(() => {
    const coords = this.decayCoordinates();
    if (coords.length === 0) return '';
    
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      // Smooth spline interpolation
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].y;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].y}`;
    }
    return path;
  });

  decayAreaPath = computed(() => {
    const coords = this.decayCoordinates();
    if (coords.length === 0) return '';
    
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].y;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].y}`;
    }
    const bottom = this.decayChartHeight - this.decayPadding;
    path += ` L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    return path;
  });

  onDecayMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const scaledX = (mouseX / rect.width) * this.decayChartWidth;

    const coords = this.decayCoordinates();
    if (coords.length === 0) return;

    let closestIndex = 0;
    let minDistance = Infinity;

    coords.forEach((coord, idx) => {
      const distance = Math.abs(coord.x - scaledX);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    this.hoveredTimeIndex.set(closestIndex);
  }

  onDecayMouseLeave() {
    this.hoveredTimeIndex.set(null);
  }

  hoveredDecayCoord = computed(() => {
    const idx = this.hoveredTimeIndex();
    if (idx === null) return null;
    return this.decayCoordinates()[idx] || null;
  });
}
