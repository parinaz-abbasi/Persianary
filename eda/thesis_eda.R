# EDA script for data_AUG.RDS
# Reads the RDS file, produces numeric/categorical summaries, missingness report,
# correlation matrix, and saves plots and CSV summaries into eda/output.

library(dplyr)
library(ggplot2)
library(tidyr)
library(readr)

# Paths
rds_path <- path.expand("~/Downloads/data_AUG.RDS")
out_dir <- "eda/output"
if (!dir.exists("eda")) dir.create("eda")
if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)

if (!file.exists(rds_path)) {
  stop("RDS file not found at: ", rds_path)
}

cat("Reading RDS from:", rds_path, "\n")
all_data <- readRDS(rds_path)

# Basic info
cat("Data dimensions:\n")
print(dim(all_data))
cat("Column names:\n")
print(names(all_data))

write.csv(data.frame(nrow = nrow(all_data), ncol = ncol(all_data)), file = file.path(out_dir, "dim.csv"), row.names = FALSE)
write.csv(data.frame(colnames = names(all_data)), file = file.path(out_dir, "colnames.csv"), row.names = FALSE)

# Save a small head/tail sample
write_csv(as.data.frame(head(all_data, 100)), file.path(out_dir, "head100.csv"))
write_csv(as.data.frame(tail(all_data, 100)), file.path(out_dir, "tail100.csv"))

# Column types
col_types <- sapply(all_data, function(x) class(x)[1])
write.csv(data.frame(name = names(col_types), type = unname(col_types)), file = file.path(out_dir, "col_types.csv"), row.names = FALSE)

# Numeric summaries
is_num <- sapply(all_data, is.numeric)
num_df <- as.data.frame(all_data)[, is_num, drop = FALSE]

if (ncol(num_df) > 0) {
  num_summary <- data.frame(
    var = names(num_df),
    n = sapply(num_df, function(x) sum(!is.na(x))),
    n_na = sapply(num_df, function(x) sum(is.na(x))),
    pct_na = sapply(num_df, function(x) mean(is.na(x)) * 100),
    mean = sapply(num_df, function(x) mean(x, na.rm = TRUE)),
    sd = sapply(num_df, function(x) sd(x, na.rm = TRUE)),
    median = sapply(num_df, function(x) median(x, na.rm = TRUE)),
    min = sapply(num_df, function(x) min(x, na.rm = TRUE)),
    max = sapply(num_df, function(x) max(x, na.rm = TRUE)),
    n_unique = sapply(num_df, function(x) length(unique(na.omit(x))))
  )
  write.csv(num_summary, file = file.path(out_dir, "numeric_summary.csv"), row.names = FALSE)

  # Histograms and boxplots (limit to first 20 numeric to avoid too many files)
  num_vars <- names(num_df)
  num_vars_to_plot <- head(num_vars, 20)
  for (v in num_vars_to_plot) {
    png(filename = file.path(out_dir, paste0("hist_", v, ".png")), width = 900, height = 600)
    p <- ggplot(as.data.frame(all_data), aes_string(x = v)) +
      geom_histogram(bins = 30, fill = "#2c7fb8", color = "white", na.rm = TRUE) +
      theme_minimal() +
      labs(title = paste("Histogram of", v), x = v, y = "Count")
    print(p)
    dev.off()

    png(filename = file.path(out_dir, paste0("box_", v, ".png")), width = 600, height = 400)
    p2 <- ggplot(as.data.frame(all_data), aes_string(y = v)) +
      geom_boxplot(fill = "#f768a1", na.rm = TRUE) +
      theme_minimal() +
      labs(title = paste("Boxplot of", v), y = v)
    print(p2)
    dev.off()
  }

  # Correlation matrix and heatmap
  if (ncol(num_df) >= 2) {
    cor_mat <- cor(num_df, use = "pairwise.complete.obs")
    write.csv(cor_mat, file = file.path(out_dir, "correlation_matrix.csv"), row.names = TRUE)

    # Melt correlation for ggplot
    library(reshape2)
    cor_melt <- reshape2::melt(cor_mat)
    png(filename = file.path(out_dir, "cor_heatmap.png"), width = 900, height = 800)
    pcor <- ggplot(cor_melt, aes(x = Var1, y = Var2, fill = value)) +
      geom_tile() +
      scale_fill_gradient2(low = "#d73027", mid = "white", high = "#1a9850", midpoint = 0) +
      theme_minimal() +
      theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
      labs(title = "Correlation matrix")
    print(pcor)
    dev.off()
  }
} else {
  cat("No numeric columns found.\n")
}

# Categorical summaries (character/factor)
is_cat <- sapply(all_data, function(x) is.factor(x) || is.character(x))
cat_df_cols <- names(all_data)[is_cat]
cat_summary_list <- list()
for (v in cat_df_cols) {
  vec <- all_data[[v]]
  tab <- sort(table(vec, useNA = "ifany"), decreasing = TRUE)
  df_tab <- as.data.frame(tab)
  names(df_tab) <- c("value", "count")
  df_tab$pct <- round(df_tab$count / sum(df_tab$count) * 100, 2)
  write.csv(df_tab, file = file.path(out_dir, paste0("cat_freq_", v, ".csv")), row.names = FALSE)
  # Barplot for top 10 levels
  topn <- head(df_tab, 10)
  png(filename = file.path(out_dir, paste0("bar_", v, ".png")), width = 900, height = 600)
  pbar <- ggplot(topn, aes(x = reorder(value, -count), y = count)) +
    geom_bar(stat = "identity", fill = "#4daf4a") +
    theme_minimal() +
    theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
    labs(title = paste("Top levels for", v), x = v, y = "Count")
  print(pbar)
  dev.off()
}

# Missingness per column
miss_summary <- data.frame(
  var = names(all_data),
  n_missing = sapply(all_data, function(x) sum(is.na(x))),
  pct_missing = sapply(all_data, function(x) mean(is.na(x)) * 100),
  stringsAsFactors = FALSE
)
write.csv(miss_summary, file = file.path(out_dir, "missingness_summary.csv"), row.names = FALSE)

png(filename = file.path(out_dir, "missingness_bar.png"), width = 900, height = 600)
miss_plot <- ggplot(miss_summary, aes(x = reorder(var, -pct_missing), y = pct_missing)) +
  geom_bar(stat = "identity", fill = "#d7191c") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1)) +
  labs(title = "Percent missing by variable", x = "Variable", y = "% missing")
print(miss_plot)
dev.off()

cat("EDA complete. Outputs written to:", normalizePath(out_dir), "\n")
