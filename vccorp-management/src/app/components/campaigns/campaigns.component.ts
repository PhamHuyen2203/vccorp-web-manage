import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { API_URL } from '../../config';

interface CampaignDailyRecord {
  campaign: number;
  day: number;
  impressions: number;
  clicks: number;
  conversions: number;
  attributions: number;
  cost: number;
  ctr: number;
  cvr: number;
  attributionRate: number;
  costBucket: string;
}

interface AggregatedCampaign {
  campaign: number;
  impressions: number;
  clicks: number;
  conversions: number;
  attributions: number;
  cost: number;
  ctr: number;
  cvr: number;
  attributionRate: number;
  costBucket: string;
}

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaigns.component.html',
  styleUrl: './campaigns.component.css'
})
export class CampaignsComponent implements OnInit {
  allDailyRecords = signal<CampaignDailyRecord[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Filters State
  searchQuery = signal<string>('');
  selectedCostBucket = signal<string>('ALL');
  selectedDay = signal<string>('ALL');

  // Table Pagination & Sort State
  currentPage = signal<number>(1);
  pageSize = 10;
  sortField = signal<keyof AggregatedCampaign>('conversions');
  sortAscending = signal<boolean>(false);

  // Interactivity
  hoveredCampaignId = signal<number | null>(null);

  daysArray = Array.from({ length: 31 }, (_, i) => i);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<CampaignDailyRecord[]>(`${API_URL}/api/campaigns`).subscribe({
      next: (data) => {
        this.allDailyRecords.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load campaigns:', err);
        this.error.set(`Failed to connect to backend server. Make sure API server is running on ${API_URL}`);
        this.loading.set(false);
      }
    });
  }

  // --- Computed Filtered & Aggregated Campaigns ---
  filteredDailyRecords = computed(() => {
    const records = this.allDailyRecords();
    const query = this.searchQuery().trim().toLowerCase();
    const bucket = this.selectedCostBucket();
    const dayStr = this.selectedDay();
    
    return records.filter(r => {
      // 1. Campaign Search filter
      if (query && !r.campaign.toString().includes(query)) return false;
      
      // 2. Cost bucket filter
      if (bucket !== 'ALL' && r.costBucket !== bucket) return false;
      
      // 3. Day filter
      if (dayStr !== 'ALL' && r.day.toString() !== dayStr) return false;
      
      return true;
    });
  });

  aggregatedCampaigns = computed(() => {
    const dailyRecords = this.filteredDailyRecords();
    const map = new Map<number, AggregatedCampaign>();
    
    // Group and sum daily stats
    dailyRecords.forEach(r => {
      if (!map.has(r.campaign)) {
        map.set(r.campaign, {
          campaign: r.campaign,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          attributions: 0,
          cost: 0,
          ctr: 0,
          cvr: 0,
          attributionRate: 0,
          costBucket: r.costBucket
        });
      }
      
      const agg = map.get(r.campaign)!;
      agg.impressions += r.impressions;
      agg.clicks += r.clicks;
      agg.conversions += r.conversions;
      agg.attributions += r.attributions;
      agg.cost += r.cost;
    });
    
    // Calculate ratios
    const list: AggregatedCampaign[] = [];
    map.forEach(agg => {
      agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) : 0;
      agg.cvr = agg.clicks > 0 ? (agg.conversions / agg.clicks) : 0;
      agg.attributionRate = agg.conversions > 0 ? (agg.attributions / agg.conversions) : 0;
      list.push(agg);
    });
    
    return list;
  });

  // Sorted and Paginated Campaigns
  sortedCampaigns = computed(() => {
    const campaigns = [...this.aggregatedCampaigns()];
    const field = this.sortField();
    const ascending = this.sortAscending();
    
    return campaigns.sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (typeof aVal === 'string') {
        return ascending ? (aVal as string).localeCompare(bVal as string) : (bVal as string).localeCompare(aVal as string);
      }
      
      return ascending ? (aVal as number) - (bVal as number) : (bVal as number) - (a[field] as number);
    });
  });

  // Top campaign rankings
  topCampaignsByConversions = computed(() => {
    return [...this.aggregatedCampaigns()]
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 5);
  });

  topCampaignsByCvr = computed(() => {
    return [...this.aggregatedCampaigns()]
      .filter(c => c.clicks >= 100) // Filter out noise with small clicks
      .sort((a, b) => b.cvr - a.cvr)
      .slice(0, 5);
  });

  paginatedCampaigns = computed(() => {
    const list = this.sortedCampaigns();
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  totalPages = computed(() => {
    return Math.ceil(this.aggregatedCampaigns().length / this.pageSize) || 1;
  });

  // --- Sorting & Pagination Triggers ---
  setSort(field: keyof AggregatedCampaign) {
    if (this.sortField() === field) {
      this.sortAscending.set(!this.sortAscending());
    } else {
      this.sortField.set(field);
      this.sortAscending.set(false);
    }
    this.currentPage.set(1); // Reset page
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.set(this.currentPage() + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.set(this.currentPage() - 1);
    }
  }

  // --- Scatter Plot Bubble Computations ---
  scatterWidth = 800;
  scatterHeight = 350;
  scatterPadding = 50;

  maxCtr = computed(() => {
    const list = this.aggregatedCampaigns();
    if (list.length === 0) return 0.5;
    const rawMax = Math.max(...list.map(c => c.ctr));
    return rawMax > 0 ? rawMax * 1.08 : 0.5; // True maximum with 8% visual buffer
  });

  maxCvr = computed(() => {
    const list = this.aggregatedCampaigns();
    if (list.length === 0) return 0.25;
    const rawMax = Math.max(...list.map(c => c.cvr));
    return rawMax > 0 ? rawMax * 1.08 : 0.25; // True maximum with 8% visual buffer
  });

  scatterBubbles = computed(() => {
    const list = this.aggregatedCampaigns();
    const maxCtrVal = this.maxCtr() || 0.5;
    const maxCvrVal = this.maxCvr() || 0.25;
    const w = this.scatterWidth - this.scatterPadding * 2;
    const h = this.scatterHeight - this.scatterPadding * 2;

    if (list.length === 0) return [];

    const costs = list.map(c => c.cost);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const costRange = maxCost - minCost || 1;

    return list.map(c => {
      // Map CTR to X coordinate with defensive clamping (0 to 1.0)
      const ctrRatio = Math.min(1.0, Math.max(0.0, c.ctr / maxCtrVal));
      const cx = this.scatterPadding + ctrRatio * w;
      
      // Map CVR to Y coordinate with defensive clamping (0 to 1.0) - Y is inverted
      const cvrRatio = Math.min(1.0, Math.max(0.0, c.cvr / maxCvrVal));
      const cy = this.scatterHeight - this.scatterPadding - cvrRatio * h;
      
      // Bubble size maps to total spend cost (between 4px and 20px radius)
      const r = 4 + ((c.cost - minCost) / costRange) * 16;

      let color = '#3b82f6'; // Low spend - blue
      if (c.costBucket === 'High spend') {
        color = '#ec4899'; // High spend - pink
      } else if (c.costBucket === 'Medium spend') {
        color = '#a855f7'; // Medium spend - purple
      }

      return {
        cx,
        cy,
        r,
        color,
        campaign: c
      };
    });
  });

  // Track hover coordinate
  onScatterBubbleHover(campaignId: number | null) {
    this.hoveredCampaignId.set(campaignId);
  }

  hoveredCampaignDetails = computed(() => {
    const id = this.hoveredCampaignId();
    if (!id) return null;
    return this.aggregatedCampaigns().find(c => c.campaign === id) || null;
  });

  hoveredBubblePosition = computed(() => {
    const id = this.hoveredCampaignId();
    if (!id) return null;
    const bubbles = this.scatterBubbles();
    const bubble = bubbles.find(b => b.campaign.campaign === id);
    if (!bubble) return null;
    return { x: bubble.cx, y: bubble.cy, r: bubble.r };
  });

  // Trigger filters reset
  resetFilters() {
    this.searchQuery.set('');
    this.selectedCostBucket.set('ALL');
    this.selectedDay.set('ALL');
    this.currentPage.set(1);
  }
}
