/**
 * NCERT textbook chapters and their sections, as task ideas next to the NEET syllabus (lib/neetSyllabus.ts).
 * Page numbers and bare "Introduction" sections are left out. Each chapter lists its sections separated by ";".
 */
type Chapter = [name: string, sections: string];

export const PHYSICS_11: Chapter[] = [
  ["Physical World", "What is physics?; Scope and excitement of physics; Physics, technology and society; Fundamental forces in nature; Nature of physical laws"],
  ["Units and Measurements", "The international system of units; Measurement of length; Measurement of mass; Measurement of time; Accuracy, precision of instruments and errors in measurement; Significant figures; Dimensions of physical quantities; Dimensional formulae and dimensional equations; Dimensional analysis and its applications"],
  ["Motion in a Straight Line", "Position, path length and displacement; Average velocity and average speed; Instantaneous velocity and speed; Acceleration; Kinematic equations for uniformly accelerated motion; Relative velocity"],
  ["Motion in a Plane", "Scalars and vectors; Multiplication of vectors by real numbers; Addition and subtraction of vectors: graphical method; Resolution of vectors; Vector addition: analytical method; Motion in a plane; Motion in a plane with constant acceleration; Relative velocity in two dimensions; Projectile motion; Uniform circular motion"],
  ["Laws of Motion", "Aristotle's fallacy; The law of inertia; Newton's first law of motion; Newton's second law of motion; Newton's third law of motion; Conservation of momentum; Equilibrium of a particle; Common forces in mechanics; Circular motion; Solving problems in mechanics"],
  ["Work, Energy and Power", "Notions of work and kinetic energy: the work-energy theorem; Work; Kinetic energy; Work done by a variable force; The work-energy theorem for a variable force; The concept of potential energy; The conservation of mechanical energy; The potential energy of a spring; Various forms of energy: the law of conservation of energy; Power; Collisions"],
  ["System of Particles and Rotational Motion", "Centre of mass; Motion of centre of mass; Linear momentum of a system of particles; Vector product of two vectors; Angular velocity and its relation with linear velocity; Torque and angular momentum; Equilibrium of a rigid body; Moment of inertia; Theorems of perpendicular and parallel axes; Kinematics of rotational motion about a fixed axis; Dynamics of rotational motion about a fixed axis; Angular momentum in case of rotations about a fixed axis; Rolling motion"],
  ["Gravitation", "Kepler's laws; Universal law of gravitation; The gravitational constant; Acceleration due to gravity of the earth; Acceleration due to gravity below and above the surface of earth; Gravitational potential energy; Escape speed; Earth satellite; Energy of an orbiting satellite; Geostationary and polar satellites; Weightlessness"],
];

export const PHYSICS_12: Chapter[] = [
  ["Electric Charges and Fields", "Electric charges; Conductors and insulators; Charging by induction; Basic properties of electric charge; Coulomb's law; Forces between multiple charges; Electric field; Electric field lines; Electric flux; Electric dipole; Dipole in a uniform external field; Continuous charge distribution; Gauss's law; Application of Gauss's law"],
  ["Electrostatic Potential and Capacitance", "Electrostatic potential; Potential due to a point charge; Potential due to an electric dipole; Potential due to a system of charges; Equipotential surfaces; Potential energy of a system of charges; Potential energy in an external field; Electrostatics of conductors; Dielectrics and polarisation; Capacitors and capacitance; The parallel plate capacitor; Effect of dielectric on capacitance; Combination of capacitors; Energy stored in a capacitor; Van de Graaff generator"],
  ["Current Electricity", "Electric current; Electric currents in conductors; Ohm's law; Drift of electrons and the origin of resistivity; Limitations of Ohm's law; Resistivity of various materials; Temperature dependence of resistivity; Electrical energy, power; Combination of resistors: series and parallel; Cells, emf, internal resistance; Cells in series and in parallel; Kirchhoff's laws; Wheatstone bridge; Meter bridge; Potentiometer"],
  ["Moving Charges and Magnetism", "Magnetic force; Motion in a magnetic field; Motion in combined electric and magnetic fields; Magnetic field due to a current element, Biot-Savart law; Magnetic field on the axis of a circular current loop; Ampere's circuital law; The solenoid and the toroid; Force between two parallel currents, the ampere; Torque on current loop, magnetic dipole; The moving coil galvanometer"],
  ["Magnetism and Matter", "The bar magnet; Magnetism and Gauss's law; The earth's magnetism; Magnetisation and magnetic intensity; Magnetic properties of materials; Permanent magnets and electromagnets"],
  ["Electromagnetic Induction", "The experiments of Faraday and Henry; Magnetic flux; Faraday's law of induction; Lenz's law and conservation of energy; Motional electromotive force; Energy consideration: a quantitative study; Eddy currents; Inductance; AC generator"],
  ["Alternating Current", "AC voltage applied to a resistor; Representation of AC current and voltage by rotating vectors: phasors; AC voltage applied to an inductor; AC voltage applied to a capacitor; AC voltage applied to a series LCR circuit; Power in AC circuit: the power factor; LC oscillations; Transformers"],
  ["Electromagnetic Waves", "Displacement current; Electromagnetic waves; Electromagnetic spectrum"],
];

export const CHEMISTRY_11: Chapter[] = [
  ["Some Basic Concepts of Chemistry", "Importance of chemistry; Nature of matter; Properties of matter and their measurement; Uncertainty in measurement; Laws of chemical combinations; Dalton's atomic theory; Atomic and molecular masses; Mole concept and molar masses; Percentage composition; Stoichiometry and stoichiometric calculations"],
  ["Structure of Atom", "Sub-atomic particles; Atomic models; Developments leading to the Bohr's model of atom; Bohr's model for hydrogen atom; Towards quantum mechanical model of the atom; Quantum mechanical model of atom"],
  ["Classification of Elements and Periodicity in Properties", "Why do we need to classify elements?; Genesis of periodic classification; Modern periodic law and the present form of the periodic table; Nomenclature of elements with atomic number > 100; Electronic configurations of elements and the periodic table; Electronic configurations and types of elements: s, p, d, f-blocks; Periodic trends in properties of elements"],
  ["Chemical Bonding and Molecular Structure", "Kössel-Lewis approach to chemical bonding; Ionic or electrovalent bond; Bond parameters; The valence shell electron pair repulsion (VSEPR) theory; Valence bond theory; Hybridisation; Molecular orbital theory; Bonding in some homonuclear diatomic molecules; Hydrogen bonding"],
  ["States of Matter", "Intermolecular forces; Thermal energy; Intermolecular forces vs thermal interactions; The gaseous state; The gas laws; Ideal gas equation; Kinetic molecular theory of gases; Behaviour of real gases: deviation from ideal gas behaviour; Liquefaction of gases; Liquid state"],
  ["Thermodynamics", "Thermodynamic state; Applications; Measurement of ΔU and ΔH: calorimetry; Enthalpy change ΔrH of a reaction; Enthalpies for different types of reactions; Spontaneity; Gibbs energy change and equilibrium"],
  ["Equilibrium", "Equilibrium in physical processes; Equilibrium in chemical processes: dynamic equilibrium; Law of chemical equilibrium and equilibrium constant; Homogeneous equilibria; Heterogeneous equilibria; Applications of equilibrium constants; Relationship between equilibrium constant K, reaction quotient Q and Gibbs energy G; Factors affecting equilibria; Ionic equilibrium in solution; Acids, bases and salts; Ionization of acids and bases; Buffer solutions; Solubility equilibria of sparingly soluble salts"],
  ["Redox Reactions", "Classical idea of redox reactions: oxidation and reduction reactions; Redox reactions in terms of electron transfer reactions; Oxidation number; Redox reactions and electrode processes"],
  ["Hydrogen", "Position of hydrogen in the periodic table; Dihydrogen H₂; Preparation of dihydrogen H₂; Properties of dihydrogen; Hydrides; Water; Hydrogen peroxide (H₂O₂); Heavy water D₂O; Dihydrogen as a fuel"],
  ["The s-Block Elements", "Group 1 elements: alkali metals; General characteristics of the compounds of the alkali metals; Anomalous properties of lithium; Some important compounds of sodium; Biological importance of sodium and potassium; Group 2 elements: alkaline earth metals; General characteristics of compounds of the alkaline earth metals; Anomalous behaviour of beryllium; Some important compounds of calcium; Biological importance of magnesium and calcium"],
  ["The p-Block Elements", "Group 13 elements: the boron family; Important trends and anomalous properties of boron; Some important compounds of boron; Uses of boron and aluminium and their compounds; Group 14 elements: the carbon family; Important trends and anomalous behaviour of carbon; Allotropes of carbon; Some important compounds of carbon and silicon"],
  ["Organic Chemistry: Some Basic Principles and Techniques", "General introduction; Tetravalence of carbon: shapes of organic compounds; Structural representations of organic compounds; Classification of organic compounds; Nomenclature of organic compounds; Isomerism; Fundamental concepts in organic reaction mechanism; Methods of purification of organic compounds; Qualitative analysis of organic compounds; Quantitative analysis"],
  ["Hydrocarbons", "Classification; Alkanes; Alkenes; Alkynes; Aromatic hydrocarbon; Carcinogenicity and toxicity"],
  ["Environmental Chemistry", "Environmental pollution; Atmospheric pollution; Water pollution; Soil pollution; Industrial waste; Strategies to control environmental pollution; Green chemistry"],
];

export const CHEMISTRY_12: Chapter[] = [
  ["The Solid State", "General characteristics of solid state; Amorphous and crystalline solids; Classification of crystalline solids; Crystal lattices and unit cells; Number of atoms in a unit cell; Close-packed structures; Packing efficiency; Calculations involving unit cell dimensions; Imperfections in solids; Electrical properties of solids; Magnetic properties of solids"],
  ["Solutions", "Types of solutions; Expressing concentration of solutions; Solubility; Vapour pressure of liquid solutions; Ideal and non-ideal solutions; Colligative properties and determination of molar mass; Abnormal molar masses"],
  ["Electrochemistry", "Electrochemical cells; Galvanic cells; Nernst equation; Conductance of electrolytic solutions; Electrolytic cells and electrolysis; Batteries; Fuel cells; Corrosion"],
  ["Chemical Kinetics", "Rate of a chemical reaction; Factors influencing rate of a reaction; Integrated rate equations; Pseudo first order reaction; Temperature dependence of the rate of a reaction; Collision theory of chemical reactions"],
  ["Surface Chemistry", "Adsorption; Catalysis; Colloids; Classification of colloids; Emulsions; Colloids around us"],
  ["General Principles and Processes of Isolation of Elements", "Occurrence of metals; Concentration of ores; Extraction of crude metal from concentrated ore; Thermodynamic principles of metallurgy; Electrochemical principles of metallurgy; Oxidation and reduction; Refining; Uses of aluminium, copper, zinc and iron"],
  ["The p-Block Elements", "Group 15 elements: general properties; Dinitrogen; Ammonia; Oxides of nitrogen; Nitric acid; Phosphorus: allotropic forms; Phosphine; Phosphorus halides; Oxoacids of phosphorus; Group 16 elements: general properties; Dioxygen; Simple oxides; Ozone; Sulphur: allotropic forms; Sulphur dioxide; Oxoacids of sulphur; Sulphuric acid; Group 17 elements: general properties; Chlorine; Hydrogen chloride; Oxoacids of halogens; Interhalogen compounds; Group 18 elements: general properties"],
  ["The d- and f-Block Elements", "Position in the periodic table; Electronic configurations of the d-block elements; General properties of the transition elements; Some important compounds of transition elements; The lanthanoids; The actinoids; Some applications of d- and f-block elements"],
  ["Coordination Compounds", "Werner's theory of coordination compounds; Definitions of some important terms; Nomenclature of coordination compounds; Isomerism in coordination compounds; Bonding in coordination compounds; Bonding in metal carbonyls; Stability of coordination compounds; Importance and applications of coordination compounds"],
  ["Haloalkanes and Haloarenes", "Classification; Nomenclature; Nature of C-X bond; Methods of preparation; Physical properties; Chemical reactions; Polyhalogen compounds"],
  ["Alcohols, Phenols and Ethers", "Classification; Nomenclature; Structures of functional groups; Alcohols and phenols: preparation, properties and reactions; Some commercially important alcohols; Ethers"],
  ["Aldehydes, Ketones and Carboxylic Acids", "Nomenclature and structure of carbonyl group; Preparation of aldehydes and ketones; Physical properties of aldehydes and ketones; Chemical reactions of aldehydes and ketones; Uses of aldehydes and ketones; Nomenclature and structure of carboxyl group; Methods of preparation of carboxylic acids; Physical properties of carboxylic acids; Chemical reactions of carboxylic acids; Uses of carboxylic acids"],
  ["Amines", "Structure of amines; Classification; Nomenclature; Preparation of amines; Physical properties; Chemical reactions; Method of preparation of diazonium salts; Physical properties of diazonium salts; Chemical reactions of diazonium salts; Importance of diazonium salts in synthesis of aromatic compounds"],
  ["Biomolecules", "Carbohydrates; Proteins; Enzymes; Vitamins; Nucleic acids"],
  ["Polymers", "Classification of polymers; Types of polymerisation reactions; Molecular mass of polymers; Biodegradable polymers; Polymers of commercial importance"],
  ["Chemistry in Everyday Life", "Drugs and their classification; Drug-target interaction; Therapeutic action of different classes of drugs; Chemicals in food; Cleansing agents"],
];

/**
 * NCERT Biology by unit, each unit listing its chapters (Units I–V are Class 11, VI–X Class 12).
 * These are units, so they read "Unit 4: Plant Physiology" with the chapters as the items under it.
 */
export const BIOLOGY_11: Chapter[] = [
  ["Diversity in the Living World", "The Living World; Biological Classification; Plant Kingdom; Animal Kingdom"],
  ["Structural Organisation in Plants and Animals", "Morphology of Flowering Plants; Anatomy of Flowering Plants; Structural Organisation in Animals"],
  ["Cell: Structure and Functions", "Cell: The Unit of Life; Biomolecules; Cell Cycle and Cell Division"],
  ["Plant Physiology", "Transport in Plants; Mineral Nutrition; Photosynthesis in Higher Plants; Respiration in Plants; Plant Growth and Development"],
  ["Human Physiology", "Digestion and Absorption; Breathing and Exchange of Gases; Body Fluids and Circulation; Excretory Products and their Elimination; Locomotion and Movement; Neural Control and Coordination; Chemical Coordination and Integration"],
];
export const BIOLOGY_12: Chapter[] = [
  ["Reproduction", "Reproduction in Organisms; Sexual Reproduction in Flowering Plants; Human Reproduction; Reproductive Health"],
  ["Genetics and Evolution", "Principles of Inheritance and Variation; Molecular Basis of Inheritance; Evolution"],
  ["Biology in Human Welfare", "Human Health and Disease; Strategies for Enhancement in Food Production; Microbes in Human Welfare"],
  ["Biotechnology", "Biotechnology: Principles and Processes; Biotechnology and its Applications"],
  ["Ecology", "Organisms and Populations; Ecosystem; Biodiversity and Conservation; Environmental Issues"],
];
