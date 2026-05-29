import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { API_URL } from '../../config';

interface SummaryData {
  impressions: number;
  clicks: number;
  conversions: number;
  attributedConversions: number;
  ctr: number;
  cvr: number;
  attributionRate: number;
}

interface DailyRecord {
  day: number;
  impressions: number;
  clicks: number;
  conversions: number;
  attributions: number;
}

interface HourlyRecord {
  hour: number;
  impressions: number;
  clicks: number;
  conversions: number;
  attributions: number;
}

interface CampaignDailyRecord {
  campaign: number;
  day: number;
  impressions: number;
  clicks: number;
  conversions: number;
  attributions: number;
  cost: number;
  costBucket: string;
}

interface OverviewResponse {
  summary: SummaryData;
  dailyTrend: DailyRecord[];
  hourlyTrend: HourlyRecord[];
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css'
})
export class OverviewComponent implements OnInit {
  // Signals for state
  summary = signal<SummaryData | null>(null);
  dailyTrend = signal<DailyRecord[]>([]);
  hourlyTrend = signal<HourlyRecord[]>([]);
  campaignRecords = signal<CampaignDailyRecord[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Chart interactivity signals
  hoveredDailyIndex = signal<number | null>(null);
  hoveredHourlyIndex = signal<number | null>(null);
  hoveredShareIndex = signal<number | null>(null);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Parallel fetching
    this.http.get<OverviewResponse>(`${API_URL}/api/overview`).subscribe({
      next: (data) => {
        this.summary.set(data.summary);
        this.dailyTrend.set(data.dailyTrend);
        
        // Fetch campaigns as well for the share donut
        this.http.get<CampaignDailyRecord[]>(`${API_URL}/api/campaigns`).subscribe({
          next: (cData) => {
            this.campaignRecords.set(cData);
            this.hourlyTrend.set(data.hourlyTrend);
            this.loading.set(false);
          },
          error: (cErr) => {
            console.error('Failed to load campaigns inside overview:', cErr);
            this.loading.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Failed to fetch overview stats:', err);
        this.error.set(`Failed to connect to backend server. Make sure the API server is running on ${API_URL}`);
        this.loading.set(false);
      }
    });
  }

  // Helper formatting functions
  formatNumber(val: number): string {
    return val.toLocaleString();
  }

  // --- SVG Path computations for Daily Trend Area Chart ---
  dailyChartWidth = 1000;
  dailyChartHeight = 250;
  dailyPadding = 40;

  maxDailyConversions = computed(() => {
    const records = this.dailyTrend();
    if (records.length === 0) return 1;
    return Math.max(...records.map(r => r.conversions));
  });

  dailyCoordinates = computed(() => {
    const records = this.dailyTrend();
    const maxVal = this.maxDailyConversions();
    const w = this.dailyChartWidth - this.dailyPadding * 2;
    const h = this.dailyChartHeight - this.dailyPadding * 2;
    
    if (records.length === 0) return [];
    
    return records.map((record, index) => {
      const x = this.dailyPadding + (index / (records.length - 1)) * w;
      const y = this.dailyChartHeight - this.dailyPadding - (record.conversions / maxVal) * h;
      return { x, y, record, index };
    });
  });

  // --- Dual Chart Scale: Daily CTR vs CVR curves ---
  maxDailyCtr = computed(() => {
    const records = this.dailyTrend();
    if (records.length === 0) return 0.5;
    const ctrs = records.map(r => r.impressions > 0 ? (r.clicks / r.impressions) : 0);
    return Math.max(...ctrs) * 1.05 || 0.5;
  });

  maxDailyCvr = computed(() => {
    const records = this.dailyTrend();
    if (records.length === 0) return 0.2;
    const cvrs = records.map(r => r.clicks > 0 ? (r.conversions / r.clicks) : 0);
    return Math.max(...cvrs) * 1.05 || 0.2;
  });

  dualCoordinates = computed(() => {
    const records = this.dailyTrend();
    const maxCtr = this.maxDailyCtr();
    const maxCvr = this.maxDailyCvr();
    const w = this.dailyChartWidth - this.dailyPadding * 2;
    const h = this.dailyChartHeight - this.dailyPadding * 2;

    if (records.length === 0) return [];

    return records.map((r, index) => {
      const x = this.dailyPadding + (index / (records.length - 1)) * w;
      
      const ctr = r.impressions > 0 ? (r.clicks / r.impressions) : 0;
      const cvr = r.clicks > 0 ? (r.conversions / r.clicks) : 0;
      
      const ctrY = this.dailyChartHeight - this.dailyPadding - (ctr / maxCtr) * h;
      const cvrY = this.dailyChartHeight - this.dailyPadding - (cvr / maxCvr) * h;

      return {
        x,
        ctrY,
        cvrY,
        ctrPercentage: (ctr * 100).toFixed(2),
        cvrPercentage: (cvr * 100).toFixed(2),
        record: r,
        index
      };
    });
  });

  ctrLinePath = computed(() => {
    const coords = this.dualCoordinates();
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${coords[0].ctrY}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].ctrY;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].ctrY;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].ctrY}`;
    }
    return path;
  });

  cvrLinePath = computed(() => {
    const coords = this.dualCoordinates();
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${coords[0].cvrY}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].cvrY;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].cvrY;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].cvrY}`;
    }
    return path;
  });

  ctrAreaPath = computed(() => {
    const coords = this.dualCoordinates();
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${coords[0].ctrY}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].ctrY;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].ctrY;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].ctrY}`;
    }
    const bottom = this.dailyChartHeight - this.dailyPadding;
    path += ` L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    return path;
  });

  cvrAreaPath = computed(() => {
    const coords = this.dualCoordinates();
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${coords[0].cvrY}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].cvrY;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].cvrY;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].cvrY}`;
    }
    const bottom = this.dailyChartHeight - this.dailyPadding;
    path += ` L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    return path;
  });

  dailyAreaPath = computed(() => {
    const coords = this.dailyCoordinates();
    if (coords.length === 0) return '';
    
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      // Smooth cubic bezier calculation
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].y;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].y}`;
    }
    
    // Close the area path to the bottom boundary
    const bottom = this.dailyChartHeight - this.dailyPadding;
    path += ` L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    return path;
  });

  dailyLinePath = computed(() => {
    const coords = this.dailyCoordinates();
    if (coords.length === 0) return '';
    
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].y;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].y}`;
    }
    return path;
  });

  // Track hover coordinate index
  onDailyMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    
    // Scale mouseX to chart coordinate space
    const scaledX = (mouseX / rect.width) * this.dailyChartWidth;
    
    const coords = this.dualCoordinates();
    if (coords.length === 0) return;
    
    // Find closest index
    let closestIndex = 0;
    let minDistance = Infinity;
    
    coords.forEach((coord, idx) => {
      const distance = Math.abs(coord.x - scaledX);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });
    
    this.hoveredDailyIndex.set(closestIndex);
  }

  onDailyMouseLeave() {
    this.hoveredDailyIndex.set(null);
  }

  hoveredDailyCoord = computed(() => {
    const idx = this.hoveredDailyIndex();
    if (idx === null) return null;
    return this.dualCoordinates()[idx] || null;
  });

  // --- Campaign Share Donut Calculations ---
  campaignDonutRadius = 60;
  campaignDonutCirc = 2 * Math.PI * this.campaignDonutRadius; // 376.99

  topCampaignsShares = computed(() => {
    const records = this.campaignRecords();
    const map = new Map<number, number>();
    
    records.forEach(r => {
      map.set(r.campaign, (map.get(r.campaign) || 0) + r.impressions);
    });

    const list = Array.from(map.entries())
      .map(([campaign, impressions]) => ({ campaign, impressions }))
      .sort((a, b) => b.impressions - a.impressions);

    const top5 = list.slice(0, 5);
    const top5Sum = top5.reduce((sum, c) => sum + c.impressions, 0);
    const totalImps = 16468027;
    const otherImps = totalImps - top5Sum;

    // Combine top 5 and "Others"
    const finalShares = top5.map((c, index) => {
      const colors = ['#4F46E5', '#0891B2', '#EC4899', '#10B981', '#F59E0B'];
      return {
        campaignId: `Campaign ${c.campaign}`,
        impressions: c.impressions,
        percentage: parseFloat(((c.impressions / totalImps) * 100).toFixed(2)),
        color: colors[index]
      };
    });

    finalShares.push({
      campaignId: 'Other Campaigns',
      impressions: otherImps,
      percentage: parseFloat(((otherImps / totalImps) * 100).toFixed(2)),
      color: '#64748B'
    });

    return finalShares;
  });

  campaignDonutSlices = computed(() => {
    const shares = this.topCampaignsShares();
    let accumulatedPercentage = 0;

    return shares.map(s => {
      const strokeDashArray = `${this.campaignDonutCirc} ${this.campaignDonutCirc}`;
      const strokeDashOffset = this.campaignDonutCirc - (s.percentage / 100) * this.campaignDonutCirc;
      const rotation = (accumulatedPercentage / 100) * 360;
      accumulatedPercentage += s.percentage;

      return {
        record: s,
        strokeDashArray,
        strokeDashOffset,
        rotation
      };
    });
  });

  // --- SVG Path computations for Hourly Trend Bar Chart ---
  hourlyChartWidth = 1000;
  hourlyChartHeight = 220;
  hourlyPadding = 40;

  maxHourlyCvr = computed(() => {
    const records = this.hourlyTrend();
    if (records.length === 0) return 0.01;
    return Math.max(...records.map(r => r.clicks > 0 ? (r.conversions / r.clicks) : 0));
  });

  hourlyBars = computed(() => {
    const records = this.hourlyTrend();
    const maxCvr = this.maxHourlyCvr();
    const w = this.hourlyChartWidth - this.hourlyPadding * 2;
    const h = this.hourlyChartHeight - this.hourlyPadding * 2;
    
    if (records.length === 0) return [];
    
    const barWidth = (w / records.length) * 0.7;
    const barGap = (w / records.length) * 0.3;
    
    return records.map((record, index) => {
      const cvr = record.clicks > 0 ? (record.conversions / record.clicks) : 0;
      const barHeight = (cvr / maxCvr) * h;
      const x = this.hourlyPadding + index * (barWidth + barGap);
      const y = this.hourlyChartHeight - this.hourlyPadding - barHeight;
      
      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        cvrPercentage: (cvr * 100).toFixed(2),
        record,
        index
      };
    });
  });

  onHourlyMouseMove(index: number) {
    this.hoveredHourlyIndex.set(index);
  }

  onHourlyMouseLeave() {
    this.hoveredHourlyIndex.set(null);
  }

  hoveredHourlyBar = computed(() => {
    const idx = this.hoveredHourlyIndex();
    if (idx === null) return null;
    return this.hourlyBars()[idx] || null;
  });

  // --- New Business Analytics & ROI Calculations ---
  totalCost = computed(() => {
    return this.campaignRecords().reduce((sum, r) => sum + (r.cost || 0), 0);
  });

  cpc = computed(() => {
    const clicks = this.summary()?.clicks || 0;
    if (clicks === 0) return 0;
    return this.totalCost() / clicks;
  });

  cpm = computed(() => {
    const imps = this.summary()?.impressions || 0;
    if (imps === 0) return 0;
    return (this.totalCost() / imps) * 1000;
  });

  cac = computed(() => {
    const convs = this.summary()?.conversions || 0;
    if (convs === 0) return 0;
    return this.totalCost() / convs;
  });

  dailyRoiStats = computed(() => {
    const records = this.campaignRecords();
    if (records.length === 0) return [];
    
    // Group by day
    const dayMap = new Map<number, { day: number; cost: number; conversions: number; impressions: number; clicks: number }>();
    records.forEach(r => {
      let entry = dayMap.get(r.day);
      if (!entry) {
        entry = { day: r.day, cost: 0, conversions: 0, impressions: 0, clicks: 0 };
        dayMap.set(r.day, entry);
      }
      entry.cost += r.cost || 0;
      entry.conversions += r.conversions || 0;
      entry.impressions += r.impressions || 0;
      entry.clicks += r.clicks || 0;
    });
    
    return Array.from(dayMap.values()).sort((a, b) => a.day - b.day);
  });

  maxDailyCost = computed(() => {
    const records = this.dailyRoiStats();
    if (records.length === 0) return 1;
    return Math.max(...records.map(r => r.cost)) || 1;
  });

  maxDailyRoiConversions = computed(() => {
    const records = this.dailyRoiStats();
    if (records.length === 0) return 1;
    return Math.max(...records.map(r => r.conversions)) || 1;
  });

  // ROI coordinates for Spend (cyan bars) vs Conversions (purple spline)
  roiCoordinates = computed(() => {
    const records = this.dailyRoiStats();
    const maxCost = this.maxDailyCost();
    const maxConvs = this.maxDailyRoiConversions();
    const w = this.dailyChartWidth - this.dailyPadding * 2;
    const h = this.dailyChartHeight - this.dailyPadding * 2;
    
    if (records.length === 0) return [];
    
    return records.map((r, index) => {
      const x = this.dailyPadding + (index / (records.length - 1)) * w;
      
      // Bar properties for daily cost
      const barHeight = (r.cost / maxCost) * h;
      const barY = this.dailyChartHeight - this.dailyPadding - barHeight;
      const barWidth = Math.max(8, (w / records.length) * 0.4);
      
      // Coordinate for conversions spline
      const convY = this.dailyChartHeight - this.dailyPadding - (r.conversions / maxConvs) * h;
      
      return {
        x,
        barY,
        barWidth,
        barHeight,
        convY,
        cost: r.cost,
        conversions: r.conversions,
        record: r,
        index
      };
    });
  });

  roiLinePath = computed(() => {
    const coords = this.roiCoordinates();
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${coords[0].convY}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].convY;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].convY;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].convY}`;
    }
    return path;
  });

  roiAreaPath = computed(() => {
    const coords = this.roiCoordinates();
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${coords[0].convY}`;
    for (let i = 1; i < coords.length; i++) {
      const cpX1 = coords[i-1].x + (coords[i].x - coords[i-1].x) / 3;
      const cpY1 = coords[i-1].convY;
      const cpX2 = coords[i-1].x + 2 * (coords[i].x - coords[i-1].x) / 3;
      const cpY2 = coords[i].convY;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${coords[i].x} ${coords[i].convY}`;
    }
    const bottom = this.dailyChartHeight - this.dailyPadding;
    path += ` L ${coords[coords.length - 1].x} ${bottom} L ${coords[0].x} ${bottom} Z`;
    return path;
  });

  hoveredRoiIndex = signal<number | null>(null);

  onRoiMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const scaledX = (mouseX / rect.width) * this.dailyChartWidth;
    
    const coords = this.roiCoordinates();
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
    
    this.hoveredRoiIndex.set(closestIndex);
  }

  onRoiMouseLeave() {
    this.hoveredRoiIndex.set(null);
  }

  hoveredRoiCoord = computed(() => {
    const idx = this.hoveredRoiIndex();
    if (idx === null) return null;
    return this.roiCoordinates()[idx] || null;
  });
}
