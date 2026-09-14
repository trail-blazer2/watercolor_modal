# Mathematical Models and Formulas (Complete Collection)

This document contains a compiled and translated collection of formulas from the provided models. The mathematical expressions are formatted in standard LaTeX for direct copying and machine readability.

## 1. Final Price Forecast Model (1-Final-s-urovni)

### 1.1 Final Price Forecast
$$ \hat{P}_{i,t}^{fut}(T_\ell) = \sum_{s=1}^{N_s} p_s \tilde{P}_{i,t}^{(s)}(T_\ell) $$
* $s$ = one of the scenarios or trajectories
* $p_s$ = probability of the scenario ($\sum_s p_s = 1$)
* $\tilde{P}_{i,t}^{(s)}$ = expected price in scenario "$s$"

### 1.2 Price Inside a Scenario
$$ \tilde{P}_{i,t}^{(s)}(E_{i,\ell}) = \exp\left[\tilde{p}_{i,t}^{(s)}(E_{i,\ell})\right] $$
$$ \tilde{p}_{i,t}^{(s)} = f_{i,t}^{mkt, P} + \alpha_{i, \ell}\left(\ln P_{i,t}^{str, (0)} - f_{i,t}^{mkt, P}\right) + \left(\ln P_{i,t}^{str,(s)} - \ln P_{i,t}^{str, (0)}\right) $$
* $\alpha$ = weight of the "structural model"

### 1.3 Structural Model Weight ($\alpha$)
$$ \alpha_{i,\ell} = \frac{(\sigma_{i,\ell}^{mkt})^2}{(\sigma_{i,\ell}^{mkt})^2 + (\sigma_{i,\ell}^{str})^2} $$
* $\sigma^{mkt}$ = uncertainty of the market valuation
* $\sigma^{str}$ = uncertainty of the structural model

### 1.4 Structural Forecast ($P^{str}$)
$$ P_{i,t}^{str,(s)}(E) = \mathbb{E}_{t}^{P,(s)}\left[\exp\left(m_{i,E}^{(s)} + x_{i,E}^{(s)}\right)\right] $$

Monte Carlo approximation:
$$ P_{i,t}^{str,(s)}(E) \approx \frac{1}{N}\sum_{n=1}^{N}\exp\left(m_{i,E}^{(s,n)} + x_{i,E}^{(s,n)}\right) $$
* $m$ = base layer
* $x$ = market layer

### 1.5 Spot Price
$$ P_{t} = \exp(m_{t} + x_{t}) $$

### 1.6 Base Layer
$$ dm_{t} = K_{m}[M(A_{t}, D_{t}, R_{t}) - m_{t}]dt + B_{L} dQ_{t}^{(L)} + \Sigma_{m} dW_{t}^{m} $$

### 1.7 Market Layer
$$ dx_{t} = [-K_{z_t}x_{t} + B_{z_t}u_{t} + G_{z_t}x_{t}]dt + B_{T} dQ_{t}^{(T)} + \Sigma_{z_t} dW_{t}^{x} $$

### 1.8 Control Vector ($u_t$)
$$ u_t^{(h)} = \begin{bmatrix} 2A_t^{(h)} - 1 \\ 2D_t - 1 \\ (2R_t - 1)\mathbf{1} \\ \mathcal{S}_t^{(h)} \end{bmatrix} $$

### 1.9 Base "Target" Price
$$ M_{i,t} = \sum_{k=1}^{K}\pi_{k,t}M_{i,t}^{(k)} $$

### 1.10 Internal Normalization
$$ a_{i,t} = 2A_{i,t} - 1, \quad d_{i,t} = 2D_{i,t} - 1, \quad r_{t} = 2R_{t} - 1 $$

### 1.11 Regime "$k$"
$$ M^{(k)}_{i,t} = \mu_{i,k} + \delta_{i,k}t + \theta^{(k)}_{A,i}a_{i,t} + \theta^{(k)}_{D,i}d_{i,t} + \theta^{(k)}_{R,i}r_t + \theta^{(k)}_{AD,i}a_{i,t}d_{i,t} + \theta^{(k)}_{AR,i}a_{i,t}r_t + \theta^{(k)}_{DR,i}d_{i,t}r_t $$

### 1.12 Market Curve
$$ f_{i,t}^{mkt}(\tau) = \underset{f:f(0)=\ln P_{i,t}}{\arg\min} \Bigg\{ \sum_{j=1}^{2}w_{i,j}^{liq}\left[f(\tau_{i,j}) - \ln P_{i,t}^{fut, (j)}\right]^2 + \lambda_{carry}\int_0^{\tau_{max}}\left[f'(v) - c^{carry}_{i,t+v}\right]^2 dv + \lambda_{smooth}\int_0^{\tau_{max}}\left[f''(v)\right]^2 dv \Bigg\} $$
* $P_{i,t}$ = spot price
* $P^{fut, (j)}$ (de facto (1) and (2)) = two current futures contracts
* $\tau_{i,j}$ = time to expiration of each futures contract

### 1.13 Expected Future Price Without Risk Premium
$$ f_{i,t}^{mkt, P}(\tau) = f_{i,t}^{mkt}(\tau) - RP_{i,t}(\tau) $$

### 1.14 Risk Premium
$$ RP_{i,t}(\tau) = f_{i,t}^{mkt}(\tau) - \ln \mathbb{E}_t^P\left[P_{i,t+\tau}\right] $$

### 1.15 Advantage of Physically Holding the Exact Commodity (Convenience Yield)
$$ y_{i,t} = \operatorname{clip}_{[y_i^{min}, y_i^{max}]}\left[y_{i,0} + \gamma_{D,i}D_{i,t} + \gamma_{I,i}q_{amount,i,t} - \gamma_{B,i}B_{i,t} + \sum_{k=1}^{K}\pi_{k,t}\gamma_{i,k}^{reg}\right] $$

### 1.16 Cost of Commodity Transfer/Holding (Cost of Carry)
$$ c^{carry}_{i,t} = r_t + c^{storage}_{i,t} + c^{insurance}_{i,t} - y_{i,t} $$

---

## 2. Normalization Formula (formula-normalizace)

$$ \tau_k(x_t) = \tanh\left(s_k\frac{x_t - \operatorname{median}(x)}{1.4826 \cdot \operatorname{median}(|x - \operatorname{median}(x)|) + \epsilon}\right) $$

**Legend:**
* $k$ = parameter name
* $x$ = parameter value (historical series)
* $x_t$ = parameter value exactly right now
* $s_k$ = direction of the parameter's influence (+ or -)
* $1.4826$ = scales the denominator (excluding $\epsilon$) to approximate standard deviation
* $\epsilon$ (represented as "?") = minimum positive number required to prevent division by zero

---

## 3. Deficit Index Model (index-deficitu)

### 3.1 Deficit Index
$$ D_{i,t} = 1 - \exp\left[-\frac{\Lambda_{D,i,t}}{1 + \psi_i B_{i,t}}\right] $$
* $\psi_i$ = strength of the buffer

### 3.2 Market Adaptability (Buffer)
$$ B_{i,t} = w_{res}b_{res,i,t} + w_{sub}b_{sub,i,t} + w_{div}b_{div,i,t} + w_{route}b_{route,i,t} + w_{dem}b_{dem,i,t} $$

### 3.3 Available Reserve Stocks
$$ b_{res,i,t} = \operatorname{clip}_{[0,1]}\left(\frac{I^{release}_{i,t}}{C^{day}_{i,t}H_i^{crit} + \epsilon}\right) $$

### 3.4 Ability to Substitute the Commodity
$$ b_{sub,i,t} = \operatorname{clip}_{[0,1]}\left(\frac{Q^{sub}_{i,t}}{Q^{shortage}_{i,t} + \epsilon}\right) $$

### 3.5 Supplier Diversification
$$ HHI_{i,t} = \sum_r s_{i,r,t}^2 $$
$$ b_{div,i,t} = \operatorname{clip}_{[0,1]}\left(\frac{1 - HHI_{i,t}}{1 - 1/N_i}\right) $$

### 3.6 Reserve Logistics Routes
$$ b_{route,i,t} = \operatorname{clip}_{[0,1]}\left(\frac{K^{alternative}_{i,t}}{M^{req}_{i,t} + \epsilon}\right) $$

### 3.7 Ability of Demand to Contract
$$ b_{dem,i,t} = \operatorname{clip}_{[0,1]}\left(\frac{|\epsilon^{demand}_{i}|}{\epsilon^{crit}_{i}}\right) $$

### 3.8 Deficit Intensity
$$ \Lambda_{D,i,t} = \sum_k w_{i,k}[-\ln(1 - q_{i,k,t} + \epsilon)] + \eta_1 q_{stock}q_{capacity} + \eta_2 q_{stock}q_{flow} + \eta_3 q_{reg}q_{log} + \eta_4 q_{weather}q_{stock} + \eta_5 q_{trade}q_{spread} $$
* $q_{i,k,t}$ = deficit component "$k$" for commodity "$i$" at time "$t$"
* $w_{i,k}$ = weight of the component for the commodity
* $\eta_1$ = low inventory and full utilization of production capacity
* $\eta_2$ = low inventory and production lower than consumption
* $\eta_3$ = sanctions and logistical issues
* $\eta_4$ = bad weather and low inventory
* $\eta_5$ = trade tension and price spread between world regions

### 3.9 Inventory Amount Component
$$ q_{amount} = \sigma\left[k_a\left(\theta_a - \frac{\text{amount}}{\text{consumption}}\right)\right] $$
* $\theta_a$ = critical stock-to-consumption ratio
* $k_a$ = strength of reaction at the critical level

### 3.10 Production Capacity Component
$$ q_{capacity} = \sigma\left[k_c\left(\frac{\text{production}}{\text{MaxProduction}} - \theta_c\right)\right] $$
* $\theta_c$ = production level at which the reserve becomes critically low
* $k_c$ = same as inventory (strength of reaction at the critical level)

### 3.11 Balance Component
$$ q_{flow} = \sigma\left[k_f\left(\frac{\text{consumption} - \text{production}}{\text{consumption}} - \theta_f\right)\right] $$
* $\theta_f$ = allowable level of disbalance

### 3.12 Politics and Sanctions Component
**Main part:**
$$ q_{reg,i,r,t} = 1 - \prod_{c=1}^{N_c}\left(1 - h_{i,r,c,t}\right) $$
* $c$ = specific "political action" (sanction, tariff, embargo, quota, etc.)
* $N_c$ = number of such actions
* $E$ = share of trading for the commodity targeted by the action
* $C$ = how strongly the action affects this exact commodity
* $S$ = formal strictness of the action
* $A$ = factual impact of the action (de facto strictness)
* $U$ = ability to bypass the action
* $1-U$ = share that cannot be bypassed
* $\omega_c$ = reliability of information and intersection with other actions

**Real impact:**
$$ h_{i,r,c,t} = \omega_c E_{i,r,c,t} C_{i,c,t} S_{c,t} A_{c,t} (1 - U_{i,r,c,t}) H_{c,t} $$

**Duration and factual "stability" of the action:**
$$ H_{c,t} = 1 - \exp\left(-\frac{d_{c,t}}{\tau_c}\right) $$
* $d_{c,t}$ = time elapsed since the action became effective
* $\tau_c$ = time required for the effect to manifest

### 3.13 Logistics Component
**Main part:**
$$ q_{log,i,r,t} = 1 - (1 - d_T)^{w_T}(1 - d_C)^{w_C}(1 - d_W)^{w_W}(1 - d_K)^{w_K}(1 - d_O)^{w_O} $$
* $T$ = actual delivery time ($T^0$ = normal delivery time)
* $C$ = current freight cost ($C^0$ = normal freight cost)
* $W$ = waiting time at logistics terminals
* $K$ = current route capacity ($K^0$ = normal route capacity)
* $O$ = on-time delivery rate
* $a_T, a_C$ = critical deviations (relative to their respective formulas)
* $w$ terms = importance (weight) of the problem
* **Important:** $w_T + w_C + w_W + w_K + w_O = 1$

**Increase in delivery time:**
$$ d_T = \operatorname{clip}_{[0,1]}\left(\frac{T_{i,r,t}/T^0_{i,r} - 1}{a_T}\right) $$

**Increase in freight cost:**
$$ d_C = \operatorname{clip}_{[0,1]}\left(\frac{C_{i,r,t}/C^0_{i,r} - 1}{a_C}\right) $$

**Congestion at logistics terminals:**
$$ d_W = \operatorname{clip}_{[0,1]}\left(\frac{W_{r,t} - W^0_r}{W^{crit}_r - W^0_r}\right) $$

**Reduction in throughput:**
$$ d_K = \operatorname{clip}_{[0,1]}\left(1 - \frac{K_{r,t}}{K^0_r}\right) $$

**Reduction in delivery reliability:**
$$ d_O = \operatorname{clip}_{[0,1]}\left(\frac{O^0_r - O_{r,t}}{O^0_r}\right) $$

### 3.14 Weather Component
**Main part:**
$$ q_{weather,i,t} = 1 - \prod_{r,e}\left(1 - h_{i,e,r,t}\right) $$

**Economic impact ($h_{i,e,r,t}$):**
$$ h_{i,e,r,t} = \omega_{i,e,r}\rho_{i,r}a_{e,r,t}\phi_{i,e,r,t}P_{e,r,t}C^{conf}_{e,r,t} $$

**Specific bad impact ($a_{e,r,t}$):**
$$ a_{e,r,t} = \operatorname{clip}_{[0,1]}\left(\frac{[s_e z_{e,r,t}]_+ - u_e}{c_e - u_e}\right) $$

**Standard anomaly ($z_{e,r,t}$):**
$$ z_{e,r,t} = \frac{X_{e,r,t} - \mu^{clim}_{e,r,t}}{\sigma^{clim}_{e,r,t}} $$
* $e$ = type of event (drought, heat, frost, hurricane, etc.)
* $X$ = actual indicator of temperature, humidity, etc.
* $\mu^{clim}$ = climatic norm
* $\sigma^{clim}$ = normal climatic deviation
* $z$ = anomaly strength
* $s_e$ = direction of anomaly; can range from -1 (dangerously low) to 1 (dangerously high)
* $u_e$ = threshold beyond which the anomaly causes damage
* $c_e$ = critical anomaly level
* $\rho$ = share of world production of commodity "$i$" in region "$r$"
* $\phi$ = current production vulnerability
* $P$ = duration of specific weather event
* $C^{conf}$ = reliability of "weather analytics"
* $\omega$ = sensitivity of a specific commodity to specific weather

### 3.15 Price Difference (Spread) in Different Parts of the World
**Main part:**
$$ q_{spread,i,b,t} = 1 - \exp\left(-\frac{g_{spread,i,b,t}}{s_i^{crit}}\right) $$

**Spread intensity ($g_{spread,i,b,t}$):**
$$ g_{spread,i,b,t} = \frac{1}{\beta_s}\ln\left[\sum_{a \neq b}\omega_{a \rightarrow b}\exp\left(\beta_s[s_{i,a \rightarrow b,t}]_+\right)\right] $$

**Price difference:**
$$ s_{i,a \rightarrow b,t} = \frac{P^{cmp}_{i,b,t} - P^{land}_{i,a \rightarrow b,t}}{P^{land}_{i,a \rightarrow b,t} + \epsilon} $$

**Cost of delivery (landed cost):**
$$ P^{land}_{i,a \rightarrow b,t} = P^{cmp}_{i,a,t} + C^{freight}_{a \rightarrow b,t} + C^{insurance}_{a \rightarrow b,t} + C^{handling}_{a \rightarrow b,t} + C^{tariff}_{a \rightarrow b,t} $$

**Standardization of all prices across all parts of the world:**
$$ P^{cmp}_{i,r,t} = U_{i,r} FX_{r \rightarrow 0,t} P^{obs}_{i,r,t} - A^{tax}_{i,r,t} - A^{qual}_{i,r,t} - A^{contract}_{i,r,t} $$

### 3.16 Export-Import Balance Tension
**Main formula:**
$$ q_{trade,i,t} = \operatorname{clip}_{[0,1]}\left(\frac{[g_{trade,i,t}]_+}{g^{crit}_{trade,i}}\right) $$

**Required import:**
$$ M^{req}_{i,t} = \sum_r \left[C_{i,r,t} + \Delta I^{target}_{i,r,t} - P_{i,r,t}\right]_+ $$

**Available surplus (possible export):**
$$ X^{avail}_{i,t} = \sum_r \left[P_{i,r,t} - C_{i,r,t} - \Delta I^{safe}_{i,r,t}\right]_+ $$

**Relative difference:**
$$ g_{trade,i,t} = \frac{M^{req}_{i,t} - X^{avail}_{i,t}}{M^{req}_{i,t} + X^{avail}_{i,t} + \epsilon} $$

---

## 4. Economic Activity Index (index-ekonomicke-aktivity)

### 4.1 Volatile Part
$$ F_{i,t} = \sum_c \omega_{i,c} \Big[ w_g \tau(\text{realGDPgrowth}_{c,t}) + w_y \tau(\text{realIncomeGrowth}_{c,t}) - w_u \tau(\text{currentUnemp}_{c,t} - \text{normalUnemp}_{c,t}) + w_p \tau(\text{PMI}_{c,t} - 50) + w_\pi I_{\pi,c,t} \Big] $$
* $F_{i,t}$ = state of the world economy right now (from the "perspective" of the commodity)
* $\sum_c$ = sum over all countries
* $\omega_{i,c}$ = importance of country "$c$" for commodity "$i$"
* $\text{PMI}_{c,t} - 50$ = centers 50 as the norm (i.e., 50 = normal, <50 = decline, >50 = growth)
* $w_g$ = weight of GDP growth
* $w_y$ = weight of real income growth
* $w_u$ = weight of unemployment
* $w_p$ = weight of PMI
* $w_\pi$ = weight of inflation stability

### 4.2 Inflation Part (Complement to Volatile Part)
$$ I_{\pi,c,t} = 2\exp\left[-\left(\frac{\pi_{c,t} - \pi^*_c}{\sigma_{\pi,c}}\right)^2\right] - 1 $$
* $I_{\pi,c,t}$ = how well or poorly inflation affects the economy
* $\pi_{c,t}$ = actual inflation
* $\pi^*_c$ = normal/target inflation
* $\sigma_{\pi,c}$ = acceptable deviation from the norm

### 4.3 Base Part
$$ L_{i,t} = \sum_c \omega_{i,c} \Big[ v_q \tau(\text{GDP}^{PPP}_{c,t}) + v_y \tau(\text{realIncome}_{c,t}) + v_f \tau(\text{FDI/GDP}_{c,t}) + v_n \tau(\text{populationGrowth}_{c,t}) \Big] $$
* $L_{i,t}$ = capability of the world economy to have a long-term need for the specific commodity
* $\text{GDP}^{PPP}_{c,t}$ = GDP at Purchasing Power Parity of a specific country
* $\text{FDI/GDP}_{c,t}$ = Foreign Direct Investment strictly as a share of GDP
* $\text{populationGrowth}_{c,t}$ = population growth rate (not absolute population)
* $v_q$ = weight of PPP GDP
* $v_y$ = weight of population income
* $v_f$ = weight of foreign direct investments
* $v_n$ = weight of population

### 4.4 "Distribution" Part
$$ \lambda_{A,i}(\tau) = \lambda^\infty_{A,i} + (\lambda^0_{A,i} - \lambda^\infty_{A,i})\exp\left(-\frac{\tau}{\vartheta_{A,i,z_t}}\right) $$
* $\lambda^0_{A,i}$ = influence of the volatile part
* $\lambda^\infty_{A,i}$ = remaining influence of the volatile part over long distances
* $\vartheta_{A,i,z_t}$ = speed of transition from "volatile state" to "normal base state" of the economy
* $z_t$ = "quality" of the market state

### 4.5 Main Index Formula
$$ A^{(\ell)}_{i,t} = \frac{1}{2}\left[1 + e^{-\kappa_{A,i}|F_{i,t} - L_{i,t}|} \tanh\left(\beta_{A,i} \left[ \lambda_{A,i}(\tau_\ell)F_{i,t} + (1 - \lambda_{A,i}(\tau_\ell))L_{i,t} + \chi_i F_{i,t} L_{i,t} \frac{F_{i,t} + L_{i,t}}{2} \right]\right)\right] $$
* $A^{(\ell)}_{i,t}$ = economic activity index of commodity "$i$" right now at time "$t$" in one of the future time positions "$\ell$"
* $F_{i,t}$ = volatile part
* $L_{i,t}$ = base part
* $\lambda_{A,i}(\tau_\ell)$ = distribution of influence between volatile and base parts
* $\chi_i$ = amplification of the effect of simultaneous growth or decline (volatile and base)
* $e^{-\kappa_{A,i}|F_{i,t} - L_{i,t}|}$ = weakening of the effect during divergence
* $\kappa_{A,i}$ = strength of the effect weakening
* $\beta_{A,i}$ = sensitivity of the index to economic changes

---

## 5. Systemic Risk Index (index-systemniho-rizika)

### 5.1 Systemic Risk Index
$$ R_\ell = \operatorname{clip}_{[0,1]}\left[ R_{\ell-1} + \left(1 - e^{-\kappa^+_{z_\ell}\Delta\tau_\ell}\right)\left(R_\ell^{raw} - R_{\ell-1}\right)_+ - \left(1 - e^{-\kappa^-_{z_\ell}\Delta\tau_\ell}\right)\left(R_{\ell-1} - R_\ell^{raw}\right)_+ \right] $$
* $\kappa^+$ = propagation speed of new risk
* $\kappa^-$ = speed of its fading

### 5.2 Step Length
$$ \Delta\tau_\ell \approx \frac{5}{365.2425} $$

### 5.3 Fundamental Risk
$$ V_t = \frac{1}{\kappa_V} \ln \left( \sum_j w_j^V e^{\kappa_V v_{j,t}} \right) $$
* $v_{j,t}$ = risk component (debt burden, debt service costs, Gini coefficient, poverty, burdens related to defense, education, healthcare, R&D spending)
* $j$ = component index
* $w_j^V$ = risk component weight
* $\kappa_V$ = degree of approaching the maximum

**Complements:**
$$ w_j^V \ge 0, \quad \sum_j w_j^V = 1 $$

### 5.4 Financial Stress (Fast)
$$ F_t^R = \frac{1}{\kappa_F} \ln \left( \sum_j w_j^F e^{\kappa_F f_{j,t}} \right) $$
* $f_{j,t}$ = financial components (interest rate shock, anomalous DXY movement, credit spreads, volatility, liquidity shortage, bond market stress, geopolitical tension)
* $w_j^F$ = their weight
* $\kappa_F$ = degree of attention to the component in the most extreme state

### 5.5 "Formal" (Raw) Risk
$$ R_\ell^{raw} = 1 - (1 - V_t)^{\alpha_V} (1 - F_t^R)^{\alpha_F} e^{-\eta_R V_t F_t^R} $$
* $\alpha_V$ = importance of fundamental risk
* $\alpha_F$ = importance of financial stress
* $\eta_R$ = their mutual reinforcement

---

## 6. MADR (Centered Indices & Regimes)

### 6.1 "Centered" Indices
$$ a_{i,t} = 2A_{i,t} - 1, \quad d_{i,t} = 2D_{i,t} - 1, \quad r_t = 2R_t - 1 $$
* $A$ = economic activity index
* $D$ = deficit index
* $R$ = systemic risk index

### 6.2 For Each Regime "$k$", It Is Necessary to Calculate:
$$ M^{(k)}_{i,t} = \mu_{i,k} + \delta_{i,k}t + \theta^{(k)}_{A,i}a_{i,t} + \theta^{(k)}_{D,i}d_{i,t} + \theta^{(k)}_{R,i}r_t + \theta^{(k)}_{AD,i}a_{i,t}d_{i,t} + \theta^{(k)}_{AR,i}a_{i,t}r_t + \theta^{(k)}_{DR,i}d_{i,t}r_t $$
* $\mu$ = base price level
* $\delta$ = long-term trend
* $\theta$ = influence of the related index and joint influence ($A, D, R$)

### 6.3 Main Part "$M$" (Long-term Equilibrium Level of the Price Logarithm)
$$ M_{i,t} = \sum_{k=1}^K \pi_{k,t} M^{(k)}_{i,t} $$

---

## 7. Forecast Date Model (predpoved)

### 7.1 Forecast Date Calculation
$$T_\ell = \begin{cases} t + 15\ell \text{ days}, & \ell = \text{from 1 to 6} \\ t + (\ell - 3) \text{ months}, & \ell = \text{from 7 to 27} \end{cases}$$

* For commodity "i", the contract with the closest expiration is chosen: $$E_{i,\ell} = \underset{E \in \mathcal{E}_i}{\arg\min} |E - T_\ell|$$
* $\mathcal{E}_i$ = available expiration dates
* If the exact required contract time does not exist, contracts with adjacent expirations are required: $$E^-_{i,\ell} \leq T_\ell \leq E^+_{i,\ell}$$

### 7.2 Interpolation Coefficient
$$\omega_{i,\ell} = \frac{T_\ell - E^-_{i,\ell}}{E^+_{i,\ell} - E^-_{i,\ell}}$$

### 7.3 Artificial Price for the Exact Date
$$\ln \hat{P}^{fut}_{i,t}(T_\ell) = (1 - \omega_{i,\ell}) \ln \hat{P}^{fut}_{i,t}(E^-_{i,\ell}) + \omega_{i,\ell} \ln \hat{P}^{fut}_{i,t}(E^+_{i,\ell})$$

---

## 8. Season Strength Sub-Index (sub-index-sila-sezonu)

### 8.1 Calendar Price Pattern
$$s_i(t) = \frac{1}{C_i} \sum_{k=1}^{K_s} \left[ a_{i,k} \cos\left(\frac{2\pi k d(t)}{365.2425}\right) + b_{i,k} \sin\left(\frac{2\pi k d(t)}{365.2425}\right) \right]$$

### 8.2 Season Strength
$$\Gamma_{i,t} = \Gamma_i^{max} \sigma\left[\gamma_{i,0} + \gamma_{i,D}(2D_{i,t} - 1) + \sum_{k=1}^K \pi_{k,t} \gamma_{i,k}^{reg}\right]$$

* $\gamma_{i,0}$ = normal seasonal sensitivity of the commodity
* $\gamma_{i,D}$ = strengthening of "seasonality" by deficit
* Complementary Sigmoid function: $$\sigma(x) = \frac{1}{1 + e^{-x}}$$

### 8.3 Seasonal Dependency
$$\mathcal{S}_{i,t}^{(h)} = \tanh\{\Gamma_{i,t}[s_i(t+h) - s_i(t)]\}$$

---

## 9. Shock Sub-Index (sub-index-soku)

### 9.1 Main Shock Sub-Index Formula
$$Q^{(r)}(t) = \tanh\left[\sum_e \rho_e^{(r)} \int_{-\infty}^t q_e(s) k_e^{(r)}(t-s) e^{(G_{z_t} - \Lambda_{z_t})(t-s)} v_e \, ds\right]$$

* $(r)$ = type of influence (long-term or short-term)
* $q_e(s)$ = strength and direction of event "e" at moment "s"
* $\rho_e$ = structural share of the event (higher values denote a more "fundamental" event; constrained between 0 and 1)

### 9.2 Maximum Influence Share of Event (e) Over Time (u)
$$k_e(u) = \frac{(1 - e^{-u/\tau_{r,e}}) \left[ \omega_e e^{-u/\tau_{f,e}} + (1 - \omega_e) e^{-(u/\tau_{s,e})^{p_e}} \right] \left(1 - \frac{u}{L_e}\right)_+^{m_e}}{Z_e}$$

* $u$ = age of the shock impulse in days
* $\tau_{r,e}$ = speed of reaction growth
* $\tau_{f,e}$ = fading duration of the fast component
* $\tau_{s,e}$ = fading duration of the slow component
* $\omega_e$ = share of the fast component
* $p_e$ = fading "format" or shape
* $L_e$ = maximum duration of the event
* $m_e$ = "smoothness" of the approach to 0 around $L_e$

### 9.3 Event Duration Dependence on Market State
$$\tau_{s,i,e} = \tau_{0,i,e} \exp\left[\eta_{D,i,e}D_{i,t} + \eta_{R,i,e}R_t + \eta_{z,i,e,z_t}\right]$$

* $\tau_{0,i,e}$ = base duration length
* $\eta_D$ = influence of deficit
* $\eta_R$ = influence of risk
* $\eta_z$ = influence of the market regime

### 9.4 Shock Influence Variables
* **Change in shock influence:** $$\Delta Q^{(r)}(t,h) = Q^{(r)}(t+h) - Q^{(r)}(t)$$
* **Objective strength of the event:** $$a_e(t) = \operatorname{clip}_{[0,1]}\left(\frac{X_e(t) - X_e^{normal}}{X_e^{critical} - X_e^{normal}}\right)$$
* **Unexpectedness of the event:** $$u_e(t) = \operatorname{clip}_{[0,1]}\left(\frac{|X_e(t) - \mathbb{E}_{t^-}[X_e(t)]|}{\sigma_e^{surprise} + \epsilon}\right)$$
* **Intensity of new information:** $$q_e(t) = a_e(t) u_e(t) C_e(t) H_e(t)$$
    * $a$ = objective scope of the shock
    * $u$ = unexpectedness
    * $C$ = certainty in the truthfulness of the shock
    * $H$ = portion of the shock that is already active
* **Direction of event influence:** $$v_{e,i} = \frac{s_{e,i} E_{e,i}}{\max_j E_{e,j} + \epsilon}$$

### 9.5 Shock Propagation
* **Propagation base ($i \neq j$):** $$\tilde{G}^{(k)}_{ij} = \theta^{sub}_k S_{ij} + \theta^{input}_k I_{ij} + \theta^{co}_k C_{ij} + \theta^{log}_k L_{ij} + \theta^{macro}_k M_{ij}$$
* **Base start:** $$\tilde{G}^{(k)}_{ii} = 0$$
* **Block against infinite "self-acceleration":** $$G_k = \frac{g_k}{\rho(|\tilde{G}_k|) + \epsilon} \tilde{G}_k$$
    * Complement constraint: $g_k < \min_i \lambda_{i,k}$
* **Speed of shock fading:** $$\lambda_{i,k} = \frac{\ln 2}{H^{shock}_{i,k}}$$
* **Total propagation component:** $$G_t = \sum_{k=1}^K \pi_{k,t} G_k$$

---

## 10. Market Regime Sub-Index (sub-index-trhovy-rezim)

### 10.1 Regime Classifications ($z_t$)
* $z_t \in \{1, 2, 3, 4\}$
    * 1 - normal market
    * 2 - economic development and demand growth
    * 3 - physical deficit or inflationary commodity shock
    * 4 - systemic crisis and high market volatility

### 10.2 Input Vector Generation
$$g_t = \begin{bmatrix} 1 \\ 2\bar{A}_t - 1 \\ 2\bar{D}_t - 1 \\ 2R_t - 1 \\ \mathcal{Z}_t(\nu_t) \\ \mathcal{Z}_t(b_t) \\ \mathcal{Z}_t(c_t) \\ \mathcal{Z}_t(Q_t) \end{bmatrix}$$

* $\bar{A}_t$ = aggregation of economic activity by importance to the specific commodity: $$\bar{A}_{i,t} = \sum_r \omega^A_{i,r} A_{r,t}, \quad \sum_r \omega^A_{i,r} = 1$$
* $\bar{D}_t$ = deficit aggregation: $$\bar{D}_t = \sum_i \omega^D_i D_{i,t}$$
* $R_t$ = systemic risk
* $\nu_t$ = "realized" volatility: $$\nu_{i,t} = \sqrt{\frac{252}{n} \sum_{j=1}^n (\Delta \ln S_{i,t-j})^2}$$
    * $S_{i,t}$ = spot price
    * $n$ = trading window size in days
    * $252$ = approximate trading days in a year
* $b_t$ = difference between the closest futures and spot contract: $$b_{i,t} = \frac{\ln(F^{(1)}_{i,t}/S_{i,t})}{\tau_{i,1}}$$
* $c_{i,t}$ = slope between 2 active futures ($F^{(1)}$ and $F^{(2)}$) with expirations ($\tau_1$ and $\tau_2$): $$c_{i,t} = \frac{\ln F^{(2)}_{i,t} - \ln F^{(1)}_{i,t}}{\tau_{i,2} - \tau_{i,1}}$$
* $Q_t$ = current strength of active shocks

### 10.3 Parameter Normalization Relative to History ($\mathcal{Z}_t$)
$$\mathcal{Z}_t(X) = \frac{1}{c_Z} \operatorname{clip}_{[-c_Z, c_Z]}\left[ \frac{X_t - \operatorname{Median}_W(X)}{1.4826 \operatorname{MAD}_W(X) + \epsilon} \right]$$

* $W$ = historical multi-day window
* $c_Z$ = boundary of an "extreme anomaly"
* $i$ = precise commodity

### 10.4 Transition Probabilities
* **Transition from regime "j" to "k":** $$p_{jk,t} = \frac{\exp(a_{jk} + \mathbf{b}_{jk}^{\mathsf{T}} \mathbf{g}_t)}{\sum_{\ell=1}^K \exp(a_{j\ell} + \mathbf{b}_{j\ell}^{\mathsf{T}} \mathbf{g}_t)}$$
    * $a_{jk}$ = baseline possibility of the transition
    * $\mathbf{b}_{jk}$ = transition sensitivity to another regime
    * $K$ = number of regimes (currently 4)
* **Base probability update:** $$\pi_{k,t}^- = \sum_j \pi_{j,t-1} p_{jk,t}$$
* **Probability upon new data inclusion:** $$\pi_{k,t} = \frac{f_k(\mathbf{y}_t) \pi_{k,t}^-}{\sum_\ell f_\ell(\mathbf{y}_t) \pi_{\ell,t}^-}$$
    * Conditioned as: $$\mathbf{y}_t \mid z_t = k \sim t_{\nu_k}(\boldsymbol{\mu}_k, \mathbf{\Sigma}_k)$$
* **Future market regimes pipeline:** $$\boldsymbol{\pi}_{T_\ell \mid t} = \boldsymbol{\pi}_t \mathbf{P}_{t+1} \mathbf{P}_{t+2} \dots \text{(and so on 27 times altogether)}$$
* **"Centering according to probability":** $$\bar{\boldsymbol{\Theta}}_t = \sum_k \pi_{k,t} \boldsymbol{\Theta}_k$$

---

## 11. Trajectory Modeling (traektorie)

### 11.1 Parameter Shift Scenario
$$d\mathbf{X}_{t'}^{(s)} = \left[\mathbf{c}_{z_{t'}} + \mathbf{K}^X_{z_{t'}}(\bar{\mathbf{X}}_{z_{t'}} - \mathbf{X}_{t'}^{(s)}) + \mathbf{C}_{z_{t'}} \ln \mathbf{P}_{t'}^{(s)} + \mathbf{B}_{z_{t'}} \mathbf{a}_{t'}^{known} + \mathbf{J}_{z_{t'}} \mathbf{a}_{t'}^{(s)}\right] dt' + \mathbf{\Omega}_{z_{t'}} d\mathbf{W}_{t'}^X$$

* $\bar{\mathbf{X}}$ = normal parameter state under a specific regime
* $\mathbf{K}^X$ = speed of returning to the normative baseline
* $\mathbf{\Omega} d\mathbf{W}^X$ = unknown random variations
* $\mathbf{a}^{known}$ = verified future events
* $\mathbf{a}^{(s)}$ = distinct scenario conditions
* **Base scenario configuration:** $$\mathbf{a}_{t'}^{(0)} = \mathbf{0}$$

### 11.2 Trajectory Updates
* **Correction calculation:** $$\mathbf{X}_{T_\ell}^+ = \mathbf{X}_{T_\ell}^- + \mathbf{K}_{T_\ell}^{ext}\left(\mathbf{Y}_{T_\ell}^{ext} - \mathbf{H}_{T_\ell}\mathbf{X}_{T_\ell}^-\right)$$
* **External forecast equation:** $$\mathbf{Y}_{T_\ell}^{ext} = \mathbf{H}_{T_\ell}\mathbf{X}_{T_\ell} + \boldsymbol{\varepsilon}_{T_\ell}^{ext}, \quad \boldsymbol{\varepsilon}_{T_\ell}^{ext} \sim N(\mathbf{0}, \mathbf{R}_{T_\ell}^{ext})$$
* **Kalman Gain Equivalent ($K^{ext}$):** $$\mathbf{K}_{T_\ell}^{ext} = \mathbf{P}_{T_\ell}^- \mathbf{H}_{T_\ell}^{\mathsf{T}}\left(\mathbf{H}_{T_\ell}\mathbf{P}_{T_\ell}^- \mathbf{H}_{T_\ell}^{\mathsf{T}} + \mathbf{R}_{T_\ell}^{ext}\right)^{-1}$$
