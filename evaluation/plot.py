"""Render standalone research figures from retained raw records; no model/scorer access."""
import json
import platform
import sys
from collections import defaultdict
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path(sys.argv[1])
rows = [json.loads(line) for line in (root / "runs.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
groups = defaultdict(list)
for row in rows:
    groups[(row["split"], row["method"], row["observations"])].append(row)

def score(group, covered=False):
    items = [item for row in group for item in row["items"] if item["kind"] == "semantic"]
    return sum(item["status"] == "answered" if covered else item["correct"] for item in items) / len(items)

plt.rcParams.update({"font.size": 10, "svg.hashsalt": "xeno-baselines-1"})
for split in sorted({r["split"] for r in rows}):
    fig, axes = plt.subplots(2, 2, figsize=(13, 9), constrained_layout=True)
    methods = sorted({r["method"] for r in rows if r["split"] == split})
    distributions, labels, last_scores = [], [], []
    for method in methods:
        budgets = sorted(k[2] for k in groups if k[:2] == (split, method))
        values = [score(groups[(split, method, n)]) for n in budgets]
        coverage = [score(groups[(split, method, n)], True) for n in budgets]
        axes[0, 0].plot(budgets, values, marker="o", label=method)
        axes[0, 1].plot(coverage, values, marker="o", label=method)
        for x, y, n in zip(coverage, values, budgets):
            axes[0, 1].annotate(str(n), (x, y), xytext=(3, 4), textcoords="offset points", fontsize=8)
        distributions.append([r["latencyMs"] for r in groups[(split, method, budgets[-1])]])
        labels.append(method)
        last_scores.append(values[-1])
    axes[0, 0].set(title="Accuracy versus observation budget", xlabel="Observed examples", ylabel="All-item semantic accuracy", ylim=(-0.03, 1.05))
    axes[0, 0].legend()
    axes[0, 1].set(title="Accuracy versus coverage (labels = observations)", xlabel="Answered / all semantic items", ylabel="Correct / all semantic items", xlim=(-0.03, 1.05), ylim=(-0.03, 1.05))
    axes[1, 0].boxplot(distributions, tick_labels=labels, showfliers=True)
    axes[1, 0].set(title="Batch latency at largest observation budget", ylabel="Wall time, milliseconds (log scale)", yscale="log")
    axes[1, 0].tick_params(axis="x", rotation=20)
    axes[1, 1].bar(labels, last_scores)
    axes[1, 1].set(title="Method ablations at largest budget", ylabel="All-item semantic accuracy", ylim=(0, 1.05))
    axes[1, 1].tick_params(axis="x", rotation=20)
    fig.suptitle(f"Xenolinguist • {split} • supplied grammar prior\nRepeated model runs retained; paired language intervals in summary.json", fontsize=13)
    fig.savefig(root / f"{split}-figures.svg", metadata={"Creator": "Parusan Natheeswaran", "Date": None})
    fig.savefig(root / f"{split}-figures.png", dpi=160, metadata={"Author": "Parusan Natheeswaran"})
    plt.close(fig)
(root / "plot-environment.json").write_text(json.dumps({"python": platform.python_version(), "matplotlib": matplotlib.__version__}, indent=2) + "\n", encoding="utf-8")
