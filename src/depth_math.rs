pub fn normalize_depth(values: &[f32]) -> Result<Vec<u8>, String> {
    if values.is_empty() {
        return Err("The depth model returned no pixels".into());
    }
    if values.iter().any(|value| !value.is_finite()) {
        return Err("The depth model returned non-finite values".into());
    }
    let minimum = values.iter().copied().fold(f32::INFINITY, f32::min);
    let maximum = values.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let range = maximum - minimum;
    if range < 1e-6 {
        return Ok(vec![0; values.len()]);
    }
    Ok(values.iter().map(|value| (((value - minimum) / range).clamp(0.0, 1.0) * 255.0).round() as u8).collect())
}

pub fn foreground_threshold(values: &[u8]) -> f32 {
    if values.is_empty() {
        return 0.58;
    }
    let mut histogram = [0_u64; 256];
    for value in values {
        histogram[*value as usize] += 1;
    }
    let total = values.len() as f64;
    let weighted_total: f64 = histogram.iter().enumerate().map(|(value, count)| value as f64 * *count as f64).sum();
    let mut background_count = 0.0;
    let mut background_sum = 0.0;
    let mut maximum_variance = 0.0;
    let mut threshold = 148.0;
    for (value, count) in histogram.iter().enumerate() {
        background_count += *count as f64;
        background_sum += value as f64 * *count as f64;
        let foreground_count = total - background_count;
        if background_count == 0.0 || foreground_count == 0.0 {
            continue;
        }
        let difference = background_sum / background_count - (weighted_total - background_sum) / foreground_count;
        let variance = background_count * foreground_count * difference * difference;
        if variance > maximum_variance {
            maximum_variance = variance;
            threshold = value as f32;
        }
    }
    let mut cumulative_count = [0.0; 256];
    let mut cumulative_sum = [0.0; 256];
    let mut count_so_far = 0.0;
    let mut sum_so_far = 0.0;
    for (value, count) in histogram.iter().enumerate() {
        count_so_far += *count as f64;
        sum_so_far += value as f64 * *count as f64;
        cumulative_count[value] = count_so_far;
        cumulative_sum[value] = sum_so_far;
    }
    let mut best_score = f64::NEG_INFINITY;
    for lower in 0..254 {
        let far_count = cumulative_count[lower];
        if far_count == 0.0 { continue; }
        for upper in lower + 1..255 {
            let middle_count = cumulative_count[upper] - far_count;
            let near_count = total - cumulative_count[upper];
            if middle_count == 0.0 || near_count == 0.0 { continue; }
            let far_sum = cumulative_sum[lower];
            let middle_sum = cumulative_sum[upper] - far_sum;
            let near_sum = weighted_total - cumulative_sum[upper];
            let score = far_sum * far_sum / far_count + middle_sum * middle_sum / middle_count + near_sum * near_sum / near_count;
            if score > best_score {
                best_score = score;
                threshold = lower as f32;
            }
        }
    }
    (threshold / 255.0).clamp(0.1, 0.8)
}

pub fn foreground_alpha(depth: u8, source_alpha: u8, threshold: f32) -> u8 {
    let threshold = if threshold.is_finite() { threshold.clamp(0.1, 0.95) } else { 0.58 };
    let distance = ((depth as f32 / 255.0 - (threshold - 0.045)) / 0.09).clamp(0.0, 1.0);
    let feather = distance * distance * (3.0 - 2.0 * distance);
    (feather * source_alpha as f32).round() as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_foreground_bright() {
        assert_eq!(normalize_depth(&[2.0, 3.0, 4.0]).unwrap(), vec![0, 128, 255]);
    }

    #[test]
    fn handles_flat_maps_without_dividing_by_zero() {
        assert_eq!(normalize_depth(&[4.0, 4.0]).unwrap(), vec![0, 0]);
    }

    #[test]
    fn rejects_invalid_model_values() {
        assert!(normalize_depth(&[f32::NAN]).is_err());
        assert!(normalize_depth(&[f32::INFINITY]).is_err());
        assert!(normalize_depth(&[]).is_err());
    }

    #[test]
    fn opaque_near_subject_and_transparent_background() {
        assert_eq!(foreground_alpha(220, 255, 0.58), 255);
        assert_eq!(foreground_alpha(90, 255, 0.58), 0);
        assert!(foreground_alpha(148, 255, 0.58) > 0);
        assert!(foreground_alpha(148, 255, 0.58) < 255);
    }

    #[test]
    fn respects_original_transparency() {
        assert_eq!(foreground_alpha(255, 0, 0.58), 0);
        assert_eq!(foreground_alpha(255, 64, 0.58), 64);
    }

    #[test]
    fn threshold_remains_bounded() {
        assert!((0.1..=0.8).contains(&foreground_threshold(&[0, 0, 0, 240, 255, 255])));
        assert_eq!(foreground_threshold(&[]), 0.58);
    }

    #[test]
    fn automatic_cutoff_keeps_middle_and_near_depth_planes() {
        let values: Vec<u8> = [vec![10; 100], vec![80; 100], vec![240; 50]].concat();
        let threshold = foreground_threshold(&values);
        assert_eq!(foreground_alpha(10, 255, threshold), 0);
        assert_eq!(foreground_alpha(80, 255, threshold), 255);
        assert_eq!(foreground_alpha(240, 255, threshold), 255);
    }
}
