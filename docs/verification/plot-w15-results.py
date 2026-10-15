"""Publication overview from a retained W15 runs.jsonl; does not modify the experiment."""
import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

experiment, destination = Path(sys.argv[1]), Path(sys.argv[2])
manifest = json.loads((experiment / "manifest.json").read_text(encoding="utf-8"))
if manifest["status"] != "complete":
    raise ValueError("A complete experiment is required")
rows = [json.loads(line) for line in (experiment / "runs.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "svg.hashsalt": "w15-publication"})
fig, axes = plt.subplots(1, 2, figsize=(12, 5.6))
fig.subplots_adjust(top=0.76, bottom=0.18, left=0.08, right=0.98, wspace=0.27)
styles = {
    "exact-lookup": ("#64748b", "s", ":"),
    "symbolic": ("#047857", "o", "-"),
    "llm-only": ("#be123c", "D", "--"),
    "hybrid": ("#1d4ed8", "^", "-."),
}
for method, (color, marker, line) in styles.items():
    for axis, kind in zip(axes, ("semantic", "lexical")):
        budgets = sorted({r["observations"] for r in rows if r["method"] == method})
        scores = []
        for budget in budgets:
            items = [i for r in rows if r["method"] == method and r["observations"] == budget for i in r["items"] if i["kind"] == kind]
            scores.append(100 * sum(i["correct"] for i in items) / len(items))
        axis.plot(budgets, scores, color=color, marker=marker, linestyle=line, label=method,
                  markersize=9 if method == "symbolic" else 6, markerfacecolor="none" if method in ("symbolic", "exact-lookup") else color, linewidth=1.8)
for axis, title in zip(axes, ("Exact semantic accuracy", "Lexical accuracy")):
    axis.set(title=title, xlabel="Observations per language", ylabel="Correct / all items (%)", ylim=(-4, 105), xticks=[8, 16, 29], yticks=[0, 25, 50, 75, 100])
    axis.grid(axis="y", alpha=0.2)
    axis.spines[["top", "right"]].set_visible(False)
fig.suptitle("Xenolinguist: measured learning under a supplied grammar prior", fontsize=16, y=0.97)
fig.legend(*axes[0].get_legend_handles_labels(), loc="upper center", bbox_to_anchor=(0.5, 0.9), ncol=4, frameon=False)
fig.text(0.5, 0.04, "30 evaluation languages · All abstentions and failures included\nTwo model sampling seeds; deterministic methods run once per language and budget", ha="center", fontsize=10, color="#475569")
fig.savefig(destination, dpi=170, metadata={"Author": "Parusan Natheeswaran"})
plt.close(fig)
