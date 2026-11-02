## Judge eval

| Judge | Prompt | Scored | Agreement | Precision (off) | Recall (off) | AUC | Mean score on / off | Score σ | Verdict flips | Unavailable | Avg latency |
|---|---|---|---|---|---|---|---|---|---|---|---|
| cf-gemma4 | j1 | 42/42 | 93% | 84% | 100% | 0.99 | 9.2 / 1.9 | 0.07 | 0/10 | 0 | 14.3 s |
| **cf-llama4-scout** (this run) | j1 | 42/42 | 79% | 64% | 100% | 0.96 | 6.7 / 2.1 | 0.00 | 0/10 | 0 | 8.2 s |

- **Agreement**: share of images where the judge's on/off call (score vs brand threshold) matches the human label.
- **Precision / recall (off)**: off-brand is the class we want to catch. Precision: when the judge says off-brand, how often it is right. Recall: how many real off-brand images it catches.
- **AUC**: chance that a random off-brand image gets a lower score than a random on-brand one. Ignores thresholds, 0.5 is a coin flip.
- **Score σ / verdict flips**: the same image judged several times. σ is the average standard deviation of the score, flips counts images whose on/off verdict changed between runs.
