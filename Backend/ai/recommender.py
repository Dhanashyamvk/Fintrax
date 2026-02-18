def generate_recommendation(category, confidence, amount):
    # ❌ Do not show low-confidence messages
    if confidence < 0.45:
        return None   # <- silently skip

    if category.lower() == "food" and amount > 300:
        return "Consider reducing food spending this month."

    if category.lower() == "transport" and amount > 500:
        return "Transport costs are high. Try cost-effective travel options."

    if amount > 1000:
        return "High expense detected. Consider setting a budget."

    return "Spending behaviour looks balanced."