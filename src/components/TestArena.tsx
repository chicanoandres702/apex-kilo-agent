import React, { useState } from 'react';
import {
  Plane,
  ShoppingBag,
  Briefcase,
  Search,
  Code,
  CheckCircle2,
  Calendar,
  MapPin,
  CreditCard,
  User,
  Mail,
  Send,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { TestScenario } from '../types';

interface TestArenaProps {
  arenaRef: React.RefObject<HTMLDivElement>;
  currentScenario: string;
  onSelectScenario: (scenario: TestScenario) => void;
  scenarios: TestScenario[];
}

export const TestArena: React.FC<TestArenaProps> = ({
  arenaRef,
  currentScenario,
  onSelectScenario,
  scenarios,
}) => {
  // Scenario 1: Flight Booking State
  const [flightOrigin, setFlightOrigin] = useState('San Francisco (SFO)');
  const [flightDest, setFlightDest] = useState('Tokyo (NRT)');
  const [flightDate, setFlightDate] = useState('2026-10-15');
  const [flightClass, setFlightClass] = useState('Business');
  const [flightSearched, setFlightSearched] = useState(false);
  const [flightBooked, setFlightBooked] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');

  // Scenario 2: E-Commerce State
  const [cartItems, setCartItems] = useState<{ id: string; name: string; price: number }[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [orderCompleted, setOrderCompleted] = useState(false);

  // Scenario 3: Job Application State
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantRole, setApplicantRole] = useState('Full Stack AI Engineer');
  const [applicantBio, setApplicantBio] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [applicationSent, setApplicationSent] = useState(false);

  // Scenario 4: Search Engine State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [hasSearched, setHasSearched] = useState(false);

  // Scenario 5: Custom Sandbox HTML
  const [customHtml, setCustomHtml] = useState(
    `<div class="p-6 bg-slate-900 text-slate-100 rounded-xl space-y-4">
  <h2 class="text-xl font-bold text-cyan-400">Custom Form Sandbox</h2>
  <p class="text-sm text-slate-400">Test autonomous agent interactions on custom inputs:</p>
  <div class="space-y-2">
    <label class="block text-xs font-mono">User Name</label>
    <input type="text" name="username" placeholder="Type username..." class="w-full bg-slate-950 border border-slate-700 p-2 rounded text-sm" />
  </div>
  <div class="space-y-2">
    <label class="block text-xs font-mono">API Token</label>
    <input type="password" name="token" placeholder="Enter token..." class="w-full bg-slate-950 border border-slate-700 p-2 rounded text-sm" />
  </div>
  <div class="flex items-center gap-2">
    <input type="checkbox" id="verify-box" name="confirm" />
    <label for="verify-box" class="text-xs">Confirm automated permissions</label>
  </div>
  <button id="custom-submit-btn" class="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded text-sm">
    Submit Request
  </button>
</div>`
  );

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-slate-950">
      {/* Top Scenario Selector Tabs */}
      <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs overflow-x-auto">
        <span className="text-slate-400 font-medium whitespace-nowrap">Test Scenarios:</span>
        {scenarios.map((sc) => {
          const isActive = currentScenario === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => onSelectScenario(sc)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {sc.id === 'flight' && <Plane className="w-3.5 h-3.5" />}
              {sc.id === 'ecommerce' && <ShoppingBag className="w-3.5 h-3.5" />}
              {sc.id === 'job' && <Briefcase className="w-3.5 h-3.5" />}
              {sc.id === 'search' && <Search className="w-3.5 h-3.5" />}
              {sc.id === 'custom' && <Code className="w-3.5 h-3.5" />}
              <span>{sc.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage / Target DOM Container */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 pb-32">
        <div
          ref={arenaRef}
          id="autonomous-target-arena"
          className="relative max-w-4xl mx-auto min-h-[520px] bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm transition-all"
        >
          {/* SCENARIO 1: FLIGHT BOOKING */}
          {currentScenario === 'flight' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Plane className="w-5 h-5 text-cyan-400" />
                    Apex Sky Airways
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Autonomous Booking Engine: Flight Search, Seat Selection & Checkout
                  </p>
                </div>
                <div className="text-xs font-mono px-2.5 py-1 bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 rounded-full">
                  Interactive Target
                </div>
              </div>

              {flightBooked ? (
                <div className="p-6 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-center space-y-3 animate-fade-in">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h3 className="text-lg font-bold text-white">Flight Confirmed!</h3>
                  <p className="text-sm text-slate-300">
                    Booking reference <span className="font-mono text-emerald-300 font-bold">#APX-9821</span> confirmed for{' '}
                    <span className="font-semibold text-white">{passengerName || 'Alex Morgan'}</span> ({passengerEmail || 'andres@example.com'}).
                  </p>
                  <p className="text-xs text-slate-400">
                    {flightOrigin} → {flightDest} on {flightDate} ({flightClass} Class)
                  </p>
                  <button
                    onClick={() => {
                      setFlightBooked(false);
                      setFlightSearched(false);
                    }}
                    className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                  >
                    Reset Booking Scenario
                  </button>
                </div>
              ) : (
                <>
                  {/* Search Flight Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                        Departure Origin
                      </label>
                      <input
                        type="text"
                        name="origin"
                        value={flightOrigin}
                        onChange={(e) => setFlightOrigin(e.target.value)}
                        placeholder="e.g. San Francisco (SFO)"
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-rose-400" />
                        Destination Arrival
                      </label>
                      <input
                        type="text"
                        name="destination"
                        value={flightDest}
                        onChange={(e) => setFlightDest(e.target.value)}
                        placeholder="e.g. Tokyo (NRT)"
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-purple-400" />
                        Departure Date
                      </label>
                      <input
                        type="date"
                        name="flightDate"
                        value={flightDate}
                        onChange={(e) => setFlightDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Travel Class</label>
                      <select
                        name="travelClass"
                        value={flightClass}
                        onChange={(e) => setFlightClass(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 outline-none"
                      >
                        <option value="Economy">Economy ($420)</option>
                        <option value="Premium Economy">Premium Economy ($780)</option>
                        <option value="Business">Business ($1,450)</option>
                        <option value="First">First Class ($2,890)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      id="search-flights-btn"
                      onClick={() => setFlightSearched(true)}
                      className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-cyan-950 transition-all text-sm"
                    >
                      <Search className="w-4 h-4" />
                      <span>Search Flights</span>
                    </button>
                  </div>

                  {/* Flight Options Cards */}
                  {flightSearched && (
                    <div className="mt-6 space-y-4 border-t border-slate-800 pt-5 animate-fade-in">
                      <h4 className="text-sm font-semibold text-slate-200">
                        Available Flights for {flightOrigin} → {flightDest}
                      </h4>

                      <div className="space-y-3">
                        <div className="p-4 bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 rounded-xl flex items-center justify-between transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-base">08:45 AM - 02:15 PM</span>
                              <span className="text-xs px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800/40 rounded">
                                Non-stop
                              </span>
                            </div>
                            <div className="text-xs text-slate-400">Apex Flight APX-302 • 10h 30m Boeing 787</div>
                          </div>
                          <div className="text-right space-y-2">
                            <div className="text-lg font-bold text-cyan-400">$850</div>
                            <button
                              id="select-flight-1-btn"
                              onClick={() => {
                                setFlightBooked(true);
                                setPassengerName(passengerName || 'Alex Morgan');
                                setPassengerEmail(passengerEmail || 'andres@example.com');
                              }}
                              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow"
                            >
                              Select Flight
                            </button>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 rounded-xl flex items-center justify-between transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-base">01:30 PM - 07:45 PM</span>
                              <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                                1 Stop (HNL)
                              </span>
                            </div>
                            <div className="text-xs text-slate-400">Apex Flight APX-710 • 12h 15m Airbus A350</div>
                          </div>
                          <div className="text-right space-y-2">
                            <div className="text-lg font-bold text-cyan-400">$690</div>
                            <button
                              id="select-flight-2-btn"
                              onClick={() => {
                                setFlightBooked(true);
                                setPassengerName(passengerName || 'Alex Morgan');
                                setPassengerEmail(passengerEmail || 'andres@example.com');
                              }}
                              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                            >
                              Select Flight
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Passenger Details fields for autonomous agent typing */}
                      <div className="mt-4 p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                        <h5 className="text-xs font-semibold text-slate-300">Passenger Information</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="text"
                            name="passengerName"
                            value={passengerName}
                            onChange={(e) => setPassengerName(e.target.value)}
                            placeholder="Full Legal Name"
                            className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs text-slate-100 outline-none focus:border-cyan-500"
                          />
                          <input
                            type="email"
                            name="passengerEmail"
                            value={passengerEmail}
                            onChange={(e) => setPassengerEmail(e.target.value)}
                            placeholder="Confirmation Email"
                            className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs text-slate-100 outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* SCENARIO 2: E-COMMERCE CHECKOUT */}
          {currentScenario === 'ecommerce' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-purple-400" />
                    Kilo Hardware Store
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Catalog, Cart Management, Discount Codes & Checkout Form
                  </p>
                </div>
                <div className="text-xs font-mono px-3 py-1 bg-purple-950/60 text-purple-300 border border-purple-800/50 rounded-full">
                  Cart Items: {cartItems.length}
                </div>
              </div>

              {orderCompleted ? (
                <div className="p-6 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h3 className="text-lg font-bold text-white">Order Placed Successfully!</h3>
                  <p className="text-sm text-slate-300">
                    Thank you! Order <span className="font-mono text-emerald-300">#KH-7712</span> has been processed for delivery to:
                  </p>
                  <p className="text-xs text-cyan-300 font-mono">{shippingAddress || '101 Cyber Way, Tech City'}</p>
                  <button
                    onClick={() => {
                      setOrderCompleted(false);
                      setCartItems([]);
                      setShippingAddress('');
                    }}
                    className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                  >
                    Shop Again
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Products Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'item1', name: 'Apex ANC Wireless Headphones', price: 199, tag: 'Bestseller' },
                      { id: 'item2', name: 'Kilo Custom Mechanical Keyboard', price: 149, tag: 'Hot' },
                      { id: 'item3', name: 'Precision Ultra Ergonomic Mouse', price: 79, tag: 'New' },
                    ].map((prod) => (
                      <div
                        key={prod.id}
                        className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <span className="text-[10px] px-2 py-0.5 bg-purple-950 text-purple-300 border border-purple-800/40 rounded">
                            {prod.tag}
                          </span>
                          <h4 className="font-bold text-white text-sm mt-2">{prod.name}</h4>
                          <div className="text-cyan-400 font-bold text-base mt-1">${prod.price}</div>
                        </div>
                        <button
                          id={`add-${prod.id}-btn`}
                          onClick={() => setCartItems((prev) => [...prev, prod])}
                          className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Add to Cart
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Cart and Checkout Section */}
                  {cartItems.length > 0 && (
                    <div className="p-5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-white">Your Shopping Cart</h4>
                        <button
                          onClick={() => setCartItems([])}
                          className="text-xs text-rose-400 hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Clear
                        </button>
                      </div>

                      <div className="space-y-2 max-h-36 overflow-y-auto">
                        {cartItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center text-xs py-1.5 border-b border-slate-800/80"
                          >
                            <span className="text-slate-300">{item.name}</span>
                            <span className="font-mono text-cyan-400">${item.price}</span>
                          </div>
                        ))}
                      </div>

                      {/* Inputs for Promo and Shipping */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <label className="text-xs text-slate-400">Discount Code</label>
                          <input
                            type="text"
                            name="promoCode"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value)}
                            placeholder="Enter APEX20"
                            className="w-full bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs text-slate-100 outline-none focus:border-purple-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-slate-400">Shipping Address</label>
                          <input
                            type="text"
                            name="shippingAddress"
                            value={shippingAddress}
                            onChange={(e) => setShippingAddress(e.target.value)}
                            placeholder="Street, City, Zip"
                            className="w-full bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs text-slate-100 outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                        <div className="text-sm font-bold text-white">
                          Total:{' '}
                          <span className="text-cyan-400 font-mono">
                            ${cartItems.reduce((sum, item) => sum + item.price, 0)}
                          </span>
                        </div>
                        <button
                          id="checkout-btn"
                          onClick={() => setOrderCompleted(true)}
                          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg"
                        >
                          Complete Checkout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SCENARIO 3: TALENT & JOB APPLICATION */}
          {currentScenario === 'job' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-teal-400" />
                    Apex Autonomous Systems — Career Portal
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Multi-Field Candidate Registration & Application Form
                  </p>
                </div>
                <div className="text-xs font-mono px-2.5 py-1 bg-teal-950 text-teal-300 border border-teal-800/40 rounded-full">
                  Job #AI-990
                </div>
              </div>

              {applicationSent ? (
                <div className="p-6 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h3 className="text-lg font-bold text-white">Application Received!</h3>
                  <p className="text-sm text-slate-300">
                    Thank you <span className="text-white font-bold">{applicantName}</span>. Your submission for{' '}
                    <span className="text-cyan-300 font-semibold">{applicantRole}</span> has been logged.
                  </p>
                  <button
                    onClick={() => {
                      setApplicationSent(false);
                      setApplicantName('');
                      setApplicantBio('');
                    }}
                    className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                  >
                    Submit Another Application
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-teal-400" />
                        Full Candidate Name
                      </label>
                      <input
                        type="text"
                        name="candidateName"
                        value={applicantName}
                        onChange={(e) => setApplicantName(e.target.value)}
                        placeholder="e.g. Dr. Alex Vance"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-teal-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-teal-400" />
                        Email Address
                      </label>
                      <input
                        type="email"
                        name="candidateEmail"
                        value={applicantEmail}
                        onChange={(e) => setApplicantEmail(e.target.value)}
                        placeholder="e.g. alex@autonomous.org"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-teal-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Target Role</label>
                    <select
                      name="candidateRole"
                      value={applicantRole}
                      onChange={(e) => setApplicantRole(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-teal-500 outline-none"
                    >
                      <option value="Full Stack AI Engineer">Full Stack AI Engineer</option>
                      <option value="Autonomous Agent Specialist">Autonomous Agent Specialist</option>
                      <option value="Senior LLM Systems Architect">Senior LLM Systems Architect</option>
                      <option value="DOM Automation QA Lead">DOM Automation QA Lead</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Technical Bio & Relevant Projects
                    </label>
                    <textarea
                      name="candidateBio"
                      rows={3}
                      value={applicantBio}
                      onChange={(e) => setApplicantBio(e.target.value)}
                      placeholder="Highlight your experience with web automation, LLM tool execution, or userscripts..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:border-teal-500 outline-none resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="terms-checkbox"
                      name="agreeTerms"
                      checked={agreedTerms}
                      onChange={(e) => setAgreedTerms(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 text-teal-600 focus:ring-teal-500 bg-slate-950 cursor-pointer"
                    />
                    <label htmlFor="terms-checkbox" className="text-xs text-slate-300 cursor-pointer select-none">
                      I certify that all provided details and portfolio links are accurate.
                    </label>
                  </div>

                  <div className="flex justify-end pt-3">
                    <button
                      id="submit-job-application-btn"
                      onClick={() => setApplicationSent(true)}
                      className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-teal-950 text-sm"
                    >
                      <Send className="w-4 h-4" />
                      <span>Submit Application</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCENARIO 4: SEARCH ENGINE */}
          {currentScenario === 'search' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Search className="w-5 h-5 text-amber-400" />
                    Apex Search Index
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Autonomous Query Dispatch, Filter Toggles & Result Traversal
                  </p>
                </div>
                <div className="text-xs font-mono text-slate-400">12,400+ indexed nodes</div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="searchQuery"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setHasSearched(true)}
                    placeholder="Search documents, API specifications, or repositories..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:border-amber-500 outline-none"
                  />
                  <button
                    id="search-index-btn"
                    onClick={() => setHasSearched(true)}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-xl shadow transition-colors"
                  >
                    Search
                  </button>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Filter:</span>
                  {['all', 'docs', 'agents', 'github', 'models'].map((flt) => (
                    <button
                      key={flt}
                      onClick={() => setActiveFilter(flt)}
                      className={`px-3 py-1 rounded-full border text-xs capitalize transition-colors ${
                        activeFilter === flt
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {flt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              {hasSearched ? (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    Displaying 3 results for query: <span className="text-amber-300 font-mono">"{searchQuery || 'Apex Kilo'}"</span>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1 hover:border-amber-500/40 transition-colors">
                    <a
                      href="#result-1"
                      className="text-sm font-bold text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      Apex Kilo Autonomous Agent v8.15 Userscript
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-xs text-slate-300">
                      Full autonomous browser agent userscript for Tampermonkey. Deep Shadow DOM scanner, visual numbered badges, and LLM reasoning via Kilo Code.
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">devproject.vip/apex-agent • Updated 2026</span>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1 hover:border-amber-500/40 transition-colors">
                    <a
                      href="#result-2"
                      className="text-sm font-bold text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      OpenCode Server Session API (Port 4096)
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-xs text-slate-300">
                      Specification for /ai session REST API with tool-locked planning for in-page autonomous browser drivers.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Enter a search term or instruct the agent to run a query.
                </div>
              )}
            </div>
          )}

          {/* SCENARIO 5: CUSTOM HTML SANDBOX */}
          {currentScenario === 'custom' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Code className="w-4 h-4 text-cyan-400" />
                  Custom HTML Sandbox
                </h3>
                <span className="text-xs text-slate-400">Live rendered below for the agent to inspect</span>
              </div>

              {/* Editable code snippet */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">Sandbox HTML Template:</label>
                <textarea
                  rows={6}
                  value={customHtml}
                  onChange={(e) => setCustomHtml(e.target.value)}
                  className="w-full bg-slate-950 font-mono text-xs text-cyan-300 border border-slate-700 p-3 rounded-xl focus:border-cyan-500 outline-none resize-y"
                />
              </div>

              {/* Live Rendered Container */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Live DOM Output:
                </div>
                <div
                  className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl min-h-[160px]"
                  dangerouslySetInnerHTML={{ __html: customHtml }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
