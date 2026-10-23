/**
 * "Teach me this concept" library. Educational, general explanations written for
 * this app. Examples use round illustrative numbers, not current market data.
 */
export type Concept = { id: string; title: string; short: string; explanation: string; example: string; whyYouCare: string };

export const CONCEPTS: Concept[] = [
  {
    id: "repo-rate",
    title: "Repo rate",
    short: "The rate at which the RBI lends short-term money to banks.",
    explanation: "When the Reserve Bank of India raises the repo rate, borrowing becomes costlier for banks, which tend to pass it on through higher loan rates. Cuts tend to do the opposite. The Monetary Policy Committee sets it, mainly to keep inflation near its target.",
    example: "If a home-loan rate is linked to the repo rate, a 0.25 percentage point increase on a ₹30 lakh, 20-year loan raises the EMI by roughly ₹450–500 a month (illustrative).",
    whyYouCare: "It influences your loan EMIs, fixed-deposit rates and, indirectly, bond and equity valuations.",
  },
  {
    id: "cpi-inflation",
    title: "CPI inflation",
    short: "How fast consumer prices are rising, year on year.",
    explanation: "The Consumer Price Index tracks a basket of goods and services households buy. Inflation is the percentage change versus a year earlier. Food has a large weight in India's CPI, so vegetable prices can swing the headline number.",
    example: "If inflation is 5%, something that cost ₹1,000 last year costs about ₹1,050 now. Savings earning 3% after tax are losing purchasing power.",
    whyYouCare: "Your real return is roughly your return minus inflation. Goals years away need inflation-adjusted targets.",
  },
  {
    id: "gdp",
    title: "GDP growth",
    short: "The rate at which the economy's output is growing.",
    explanation: "Gross Domestic Product measures the value of goods and services produced. Quarterly growth figures are revised later as more data arrives, so first estimates can change.",
    example: "Growth of 7% means the economy produced about 7% more, after adjusting for prices, than a year earlier.",
    whyYouCare: "Strong growth usually supports jobs and corporate earnings; slowdowns can affect hiring and bonuses.",
  },
  {
    id: "npa",
    title: "Non-performing assets (NPAs)",
    short: "Loans where the borrower has stopped paying.",
    explanation: "A loan is generally classified as non-performing when interest or principal is overdue for more than 90 days. Gross NPA is the total; net NPA subtracts provisions banks have set aside.",
    example: "A bank with ₹100 of loans and ₹3 in NPAs has a gross NPA ratio of 3%.",
    whyYouCare: "Asset quality drives bank profitability and how freely banks lend, which matters if you work in or invest in financial services.",
  },
  {
    id: "sip",
    title: "SIP (systematic investment plan)",
    short: "Investing a fixed amount in a mutual fund at regular intervals.",
    explanation: "A SIP buys more units when prices are low and fewer when high (rupee-cost averaging). It builds discipline but does not guarantee profits or protect against losses.",
    example: "₹5,000 a month for 12 months invests ₹60,000; the value at the end depends entirely on how the fund performs.",
    whyYouCare: "Automating contributions after essentials and reserves are covered is a common way to stay consistent.",
  },
  {
    id: "expense-ratio",
    title: "Expense ratio",
    short: "The annual fee a mutual fund charges, as a % of your investment.",
    explanation: "It is deducted from the fund's returns daily. Direct plans have lower expense ratios than regular plans because they exclude distributor commission.",
    example: "On ₹1 lakh, a 1% expense ratio costs about ₹1,000 a year versus ₹200 at 0.2%. Over decades the gap compounds significantly.",
    whyYouCare: "Fees are one of the few things you control. Scenario projections in Plan show their effect.",
  },
  {
    id: "bond-yield",
    title: "Bond yields",
    short: "The return an investor gets from holding a bond, which moves opposite to its price.",
    explanation: "When yields rise, existing bonds with lower coupons become less attractive, so their prices fall. The 10-year government bond yield is a key benchmark for borrowing costs.",
    example: "If yields rise from 7% to 7.5%, a debt fund holding long-dated bonds can show a short-term loss.",
    whyYouCare: "Affects debt fund returns, loan rates and how equities are valued.",
  },
  {
    id: "fpi",
    title: "FPI flows",
    short: "Money foreign portfolio investors move into or out of Indian stocks and bonds.",
    explanation: "Large outflows can pressure markets and the rupee; inflows can support them. Flows respond to global interest rates, risk appetite and valuations.",
    example: "Sustained selling by FPIs during a period of rising US rates is a commonly cited pattern.",
    whyYouCare: "Explains some short-term market moves that have little to do with company fundamentals.",
  },
  {
    id: "credit-growth",
    title: "Credit growth",
    short: "How fast bank lending is expanding.",
    explanation: "Measured as year-on-year growth in loans. Fast growth can signal strong demand, but if deposits grow slower, banks may need to raise deposit rates to fund lending.",
    example: "If loans grow 15% and deposits 11%, banks compete harder for deposits.",
    whyYouCare: "Shapes FD rates, loan availability and bank earnings.",
  },
  {
    id: "pe-ratio",
    title: "Price-to-earnings (P/E)",
    short: "Share price divided by earnings per share.",
    explanation: "A rough gauge of how much investors pay for each rupee of profit. A high P/E can reflect growth expectations or optimism; it is not a buy or sell signal by itself.",
    example: "A ₹500 share with ₹25 earnings per share has a P/E of 20.",
    whyYouCare: "Common in equity research and interviews for financial-services roles.",
  },
  {
    id: "emergency-fund",
    title: "Emergency fund",
    short: "Cash set aside for unexpected expenses or loss of income.",
    explanation: "Usually kept in safe, liquid places like a savings account, sweep FD or liquid fund. A common guideline is 3–6 months of essential expenses, more if income is variable.",
    example: "Essentials of ₹40,000 a month suggest a ₹1.2–2.4 lakh reserve.",
    whyYouCare: "It lets you avoid high-interest debt or selling investments at a bad time.",
  },
  {
    id: "real-return",
    title: "Real vs nominal return",
    short: "Return after subtracting inflation.",
    explanation: "Nominal return is the headline growth. Real return ≈ nominal return − inflation. Taxes reduce it further.",
    example: "An FD at 7% with 5% inflation has a real return of about 2% before tax.",
    whyYouCare: "Goals are about what money can buy, not the number in the account.",
  },
];

export const conceptById = (id: string) => CONCEPTS.find((c) => c.id === id);
