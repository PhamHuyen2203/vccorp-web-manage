import os
import json
import pymongo
import pandas as pd
import numpy as np
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import (
    precision_score, recall_score, f1_score, accuracy_score,
    roc_auc_score, average_precision_score, roc_curve, precision_recall_curve
)

def main():
    print("Connecting to MongoDB...")
    client = pymongo.MongoClient("mongodb://localhost:27020")
    db = client["vccorp"]
    collection = db["data_ads_final"]

    print("Fetching clicked events from the 18% user-based sample...")
    # Fetch clicked events and filter in memory using streaming cursor
    # to maintain full compatibility across MongoDB / PyMongo versions
    cursor = collection.find({"click": 1}, projection=[
        "timestamp", "uid", "campaign", "cost", "time_since_last_click",
        "cat1", "cat2", "cat3", "cat4", "cat5", "cat6", "cat7", "cat8", "cat9", "conversion"
    ])
    
    data = []
    # Stop when we have 100,000 clicked records to ensure fast & reliable local training
    max_records = 100000
    for doc in cursor:
        uid = doc.get("uid", 0)
        if uid % 100 < 18:
            data.append(doc)
            if len(data) >= max_records:
                break
                
    print(f"Successfully fetched and filtered {len(data)} clicked documents.")
    
    if len(data) == 0:
        print("No data found!")
        return

    # Convert to DataFrame
    df = pd.DataFrame(data)
    
    print("Preprocessing data and engineering features...")
    # 1. Hour and Day features
    df["hour"] = (df["timestamp"] // 3600) % 24
    df["day"] = (df["timestamp"] // 86400)
    
    # 2. Cost Bucket features (Low / Medium / High spend per campaign)
    campaign_costs = df.groupby("campaign")["cost"].sum()
    costs_array = sorted(campaign_costs.values)
    n_campaigns = len(costs_array)
    low_boundary = costs_array[int(n_campaigns * 0.33)] if n_campaigns > 0 else 0
    med_boundary = costs_array[int(n_campaigns * 0.66)] if n_campaigns > 0 else 0
    
    def get_cost_bucket(campaign_id):
        cost = campaign_costs.get(campaign_id, 0)
        if cost > med_boundary:
            return "High spend"
        elif cost > low_boundary:
            return "Medium spend"
        else:
            return "Low spend"
            
    df["cost_bucket"] = df["campaign"].map(get_cost_bucket)
    
    # 3. Handling time_since_last_click
    df["time_since_last_click_missing"] = (df["time_since_last_click"] == -1).astype(int)
    df["time_since_last_click_clean"] = df["time_since_last_click"].replace(-1, np.nan)
    
    # 4. Cast categorical columns to string for safe encoding
    categorical_features = ['campaign', 'cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6', 'cat7', 'cat8', 'cat9', 'cost_bucket']
    df[categorical_features] = df[categorical_features].astype(str)
    
    # Define features, target and group key
    numeric_features = ['timestamp', 'cost', 'day', 'hour', 'time_since_last_click_clean', 'time_since_last_click_missing']
    feature_cols = numeric_features + categorical_features
    
    X = df[feature_cols].copy()
    y = df["conversion"].copy()
    groups = df["uid"].copy()
    
    # 5. GroupShuffleSplit to split dataset safely by User (UID)
    print("Splitting dataset safely into Train / Val / Test based on UID...")
    gss_test = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_val_idx, test_idx = next(gss_test.split(X, y, groups=groups))
    
    X_train_val, X_test = X.iloc[train_val_idx], X.iloc[test_idx]
    y_train_val, y_test = y.iloc[train_val_idx], y.iloc[test_idx]
    groups_train_val = groups.iloc[train_val_idx]
    
    gss_val = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_idx, val_idx = next(gss_val.split(X_train_val, y_train_val, groups=groups_train_val))
    
    X_train, X_val = X_train_val.iloc[train_idx], X_train_val.iloc[val_idx]
    y_train, y_val = y_train_val.iloc[train_idx], y_train_val.iloc[val_idx]
    
    print(f"Dataset split complete:")
    print(f" - Train: {X_train.shape[0]} rows ({y_train.mean():.4%} CVR)")
    print(f" - Validation: {X_val.shape[0]} rows ({y_val.mean():.4%} CVR)")
    print(f" - Test: {X_test.shape[0]} rows ({y_test.mean():.4%} CVR)")
    
    # 6. Building preprocessing pipeline
    print("Building pipelines and One-Hot Encoding category features...")
    try:
        onehot = OneHotEncoder(handle_unknown="ignore", sparse_output=True)
    except TypeError:
        onehot = OneHotEncoder(handle_unknown="ignore", sparse=True)
        
    numeric_transformer_lr = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler(with_mean=False))
    ])
    
    categorical_transformer_lr = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", onehot)
    ])
    
    preprocess_lr = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer_lr, numeric_features),
            ("cat", categorical_transformer_lr, categorical_features)
        ]
    )
    
    # 7. Model definitions
    print("Defining models...")
    # Model 1: Dummy Baseline
    dummy_model = DummyClassifier(strategy="stratified", random_state=42)
    
    # Model 2: Logistic Regression (Selected model)
    logistic_model = Pipeline(steps=[
        ("preprocess", preprocess_lr),
        ("model", LogisticRegression(
            max_iter=150,
            class_weight="balanced",
            solver="saga",
            n_jobs=-1,
            random_state=42
        ))
    ])
    
    # Preprocessor for Tree models
    numeric_transformer_tree = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median"))
    ])
    preprocess_tree = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer_tree, numeric_features),
            ("cat", categorical_transformer_lr, categorical_features)
        ]
    )
    
    # Model 3: Random Forest
    rf_model = Pipeline(steps=[
        ("preprocess", preprocess_tree),
        ("model", RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            class_weight="balanced",
            n_jobs=-1,
            random_state=42
        ))
    ])
    
    # Model 4: Gradient Boosting
    gb_model = Pipeline(steps=[
        ("preprocess", preprocess_tree),
        ("model", GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=5,
            random_state=42
        ))
    ])
    
    # 8. Model Training
    print("Training Dummy Baseline...")
    dummy_model.fit(X_train, y_train)
    dummy_val_proba = dummy_model.predict_proba(X_val)[:, 1]
    dummy_test_proba = dummy_model.predict_proba(X_test)[:, 1]
    dummy_pred_test = dummy_model.predict(X_test)
    
    print("Training Logistic Regression...")
    logistic_model.fit(X_train, y_train)
    logistic_val_proba = logistic_model.predict_proba(X_val)[:, 1]
    logistic_test_proba = logistic_model.predict_proba(X_test)[:, 1]
    logistic_pred_test = (logistic_test_proba >= 0.5).astype(int)
    
    print("Training Random Forest...")
    rf_model.fit(X_train, y_train)
    rf_val_proba = rf_model.predict_proba(X_val)[:, 1]
    rf_test_proba = rf_model.predict_proba(X_test)[:, 1]
    rf_pred_test = (rf_test_proba >= 0.5).astype(int)
    
    print("Training Gradient Boosting...")
    gb_model.fit(X_train, y_train)
    gb_val_proba = gb_model.predict_proba(X_val)[:, 1]
    gb_test_proba = gb_model.predict_proba(X_test)[:, 1]
    gb_pred_test = (gb_test_proba >= 0.5).astype(int)
    
    # 9. Computing Metrics
    print("Evaluating models and computing metrics...")
    def get_metrics(y_true, y_pred, y_prob):
        return {
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_true, y_prob)),
            "pr_auc": float(average_precision_score(y_true, y_prob))
        }
        
    lr_metrics = get_metrics(y_test, logistic_pred_test, logistic_test_proba)
    print(f"Logistic Regression Test Metrics: {lr_metrics}")
    
    # Build curves for Selected Model (Logistic Regression)
    fpr, tpr, _ = roc_curve(y_test, logistic_test_proba)
    roc_indices = np.linspace(0, len(fpr) - 1, 100, dtype=int)
    roc_curve_data = [{"fpr": float(fpr[i]), "tpr": float(tpr[i])} for i in roc_indices]
    
    prec, rec, _ = precision_recall_curve(y_test, logistic_test_proba)
    pr_indices = np.linspace(0, len(prec) - 1, 100, dtype=int)
    pr_curve_data = [{"precision": float(prec[i]), "recall": float(rec[i])} for i in pr_indices]
    
    # Probability distribution for histogram
    hist, bin_edges = np.histogram(logistic_test_proba, bins=10, range=(0, 1))
    probability_distribution = []
    for i in range(10):
        probability_distribution.append({
            "bin": f"{int(bin_edges[i]*100)}-{int(bin_edges[i+1]*100)}%",
            "count": int(hist[i])
        })
        
    # High / Medium / Low target priority cohorts
    low_count = int(np.sum(logistic_test_proba < 0.02))
    med_count = int(np.sum((logistic_test_proba >= 0.02) & (logistic_test_proba <= 0.10)))
    high_count = int(np.sum(logistic_test_proba > 0.10))
    
    probability_groups = [
        {"group": "Low (< 2%)", "count": low_count, "description": "Users with minimal conversion interest. Suggest low bidding or exclusion."},
        {"group": "Medium (2-10%)", "count": med_count, "description": "Users with standard interest. Optimal for retargeting."},
        {"group": "High (> 10%)", "count": high_count, "description": "High intent users. Target aggressively with highest priority and bidding."}
    ]
    
    # Comparison table
    comparison = [
        {
            "model": "Dummy Baseline",
            "precision": float(precision_score(y_test, dummy_pred_test, zero_division=0)),
            "recall": float(recall_score(y_test, dummy_pred_test, zero_division=0)),
            "f1_score": float(f1_score(y_test, dummy_pred_test, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, dummy_test_proba)),
            "pr_auc": float(average_precision_score(y_test, dummy_test_proba))
        },
        {
            "model": "Logistic Regression",
            "precision": lr_metrics["precision"],
            "recall": lr_metrics["recall"],
            "f1_score": lr_metrics["f1_score"],
            "roc_auc": lr_metrics["roc_auc"],
            "pr_auc": lr_metrics["pr_auc"]
        },
        {
            "model": "Random Forest",
            "precision": float(precision_score(y_test, rf_pred_test, zero_division=0)),
            "recall": float(recall_score(y_test, rf_pred_test, zero_division=0)),
            "f1_score": float(f1_score(y_test, rf_pred_test, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, rf_test_proba)),
            "pr_auc": float(average_precision_score(y_test, rf_test_proba))
        },
        {
            "model": "Gradient Boosting",
            "precision": float(precision_score(y_test, gb_pred_test, zero_division=0)),
            "recall": float(recall_score(y_test, gb_pred_test, zero_division=0)),
            "f1_score": float(f1_score(y_test, gb_pred_test, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, gb_test_proba)),
            "pr_auc": float(average_precision_score(y_test, gb_test_proba))
        }
    ]
    
    results = {
        "model_selected": "Logistic Regression",
        "performance": lr_metrics,
        "roc_curve": roc_curve_data,
        "pr_curve": pr_curve_data,
        "probability_distribution": probability_distribution,
        "probability_groups": probability_groups,
        "comparison": comparison
    }
    
    # Save directly in the same directory as the script (my-server)
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prediction_metrics.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
        
    print("Saved prediction metrics successfully!")

if __name__ == "__main__":
    main()
